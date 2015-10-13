import {expect} from 'chai'
import {Registry} from '../registry'
import {is, Map, Set} from 'immutable'
//import {Promise} from 'bluebird'

describe('registry', () => {

  let r
  const id1 = 1, id2 = 2

  function unorderedEquals(v1, v2) {
    v1 = Set(v1).toJS().sort()
    v2 = Set(v2).toJS().sort()
    expect(v1).eql(v2)
  }

  beforeEach(() => {
    r = new Registry()
  })


  describe('Read-write conflicts', () => {

    it('basics', () => {
      r.addWrite(id1, ['a', 'b'], 'value')
      // transaction is not conflicting with writes
      unorderedEquals(r.conflictingWithWrite(['a', 'b']), [])
      unorderedEquals(r.conflictingWithWrite(['a', 'b', 'c']), [])

      // write-read conflicts along the path
      unorderedEquals(r.conflictingWithRead([]), [id1])
      unorderedEquals(r.conflictingWithRead(['a']), [id1])
      unorderedEquals(r.conflictingWithRead(['a', 'b']), [id1])
      unorderedEquals(r.conflictingWithRead(['a', 'b', 'c']), [id1])

      // transaction is not conflicitg with reading other part of the object
      unorderedEquals(r.conflictingWithRead(['b']), [])
      unorderedEquals(r.conflictingWithRead(['a', 'c']), [])
    })

    it('no exclusion after cleanup', () => {
      r.addWrite(id1, ['a', 'b'], 'da_value')
      r.cleanup(id1)
      expect(is(r.writesByPath, Map())).to.equal(true)
      unorderedEquals(r.conflictingWithRead([]), [])
      unorderedEquals(r.conflictingWithRead(['a']), [])
      unorderedEquals(r.conflictingWithRead(['a', 'b']), [])
      unorderedEquals(r.conflictingWithRead(['a', 'b', 'c']), [])
    })

    it('more complicated write-read conflicts with cleanup', () => {
      r.addWrite(id1, ['a', 'b'], 'da_value')
      r.addWrite(id2, ['a', 'c'], 'da_value')
      unorderedEquals(r.conflictingWithRead(['a']), [id1, id2])
      r.cleanup(id1)
      // id1 was already cleaned, id2 is still active
      unorderedEquals(r.conflictingWithRead(['a']), [id2])
      unorderedEquals(r.conflictingWithRead(['a', 'b']), [])
      unorderedEquals(r.conflictingWithRead(['a', 'c']), [id2])
      // all writes got cleaned
      r.cleanup(id2)
      unorderedEquals(r.conflictingWithRead(['a', 'c']), [])
      expect(is(r.writesByPath, Map())).to.equal(true)
    })
  })

  describe('readAsIfTrx', () => {

    it('shallow', () => {
      r.addWrite(id1, [], {'a': 'b'})
      expect(r.readAsIfTrx(id2, [], {'ao': 'bo'})).eql({'ao': 'bo'})
      expect(r.readAsIfTrx(id1, [], {'ao': 'bo'})).eql({'a': 'b'})
    })

    it('requested_path within write', () => {
      r.addWrite(id1, [], {'a': {'b': 'c'}})
      expect(r.readAsIfTrx(id1, ['a'], {'bo': 'co'})).eql({'b': 'c'})
    })

    it('plain merge', () => {
      r.addWrite(id1, ['a'], 'a_value')
      expect(r.readAsIfTrx(id1, [], {a2: 'a2_value'})).eql({a: 'a_value', a2: 'a2_value'})
    })

    it('does not mess with top-level attrs when writing deep', () => {
      r.addWrite(id1, ['a', 'b'], 'c')
      expect(r.readAsIfTrx(id1, [], {'a': {'b': 'co'}, 'a2': 'b2'})).eql({'a': {'b': 'c'}, 'a2': 'b2'})
    })

    it('more complex merge ', () => {
      r.addWrite(id1, ['a', 'b'], {'c': 'd'})
      expect(r.readAsIfTrx(id1, [], {'a': {'b': {'c': 'do', 'c2': 'd2o'}, 'b2': 'c2'}}))
        .eql({'a': {'b': {'c': 'd'}, 'b2': 'c2'}})
    })

    it('reading deeper paths ', () => {
      r.addWrite(id1, ['a', 'b'], {'c': 'd'})
      expect(r.readAsIfTrx(id1, ['a', 'b', 'c'], undefined)).eql('d')
      expect(r.readAsIfTrx(id1, ['a', 'b'], 'co'))
        .eql({'c': 'd'})
      expect(r.readAsIfTrx(id1, ['a'], {'b': 'co', 'b2o': 'c2o'}))
        .eql({'b2o': 'c2o', 'b': {'c': 'd'}})
    })

  })
})

