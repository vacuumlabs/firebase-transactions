import Firebase from 'firebase'
import {expect} from 'chai'
import {runSandboxed, set, read} from '../lib/firebase_useful'
import {getClient} from '../lib/client'
import {transactor} from '../lib/transactor'
import {firebaseUrl} from '../lib/settings'

describe('transactor', function() {

  const globalFirebase = new Firebase(firebaseUrl)
  this.timeout(60 * 60 * 1000)

  it(`change`, () => {
    return runSandboxed(globalFirebase, (firebase) => {
      const submitTrx = getClient(firebase)
      set(firebase.child('obj'), {'val': 1})
      const incByOne = ({change}, data) => {
        return change(['obj', 'val'], (x) => x + 1)
      }
      transactor(firebase, {incByOne})
      return submitTrx('incByOne', {})
        .then((_) => read(firebase.child('obj/val')))
        .then((val) => expect(val).to.equal(2))
    }, {prefix: 'test', deleteAfter: true})
  })

  it(`result`, () => {
    return runSandboxed(globalFirebase, (firebase) => {
      const submitTrx = getClient(firebase)
      const returnHello = ({}, data) => 'hello'
      transactor(firebase, {returnHello})
      return submitTrx('returnHello', {})
        .then((res) => expect(res).to.equal('hello'))
    }, {prefix: 'test'})
  })

  it(`aborts`, () => {
    return runSandboxed(globalFirebase, (firebase) => {
      const submitTrx = getClient(firebase)
      const abort = ({abort}, data) => {abort('not today')}
      transactor(firebase, {abort})
      return submitTrx('abort', {})
        .then((res) => expect(res).to.deep.equal({userError: 'not today'}))
    }, {prefix: 'test'})
  })

  it(`handle throwing trx`, () => {
    return runSandboxed(globalFirebase, (firebase) => {
      process.env.supressErrors = true
      const submitTrx = getClient(firebase)
      const throwing = ({}, data) => {
        throw new Error('Not everything is awesome')
      }
      transactor(firebase, {throwing})
      return submitTrx('throwing', {})
        .then((res) => expect(res).to.deep.equal({error: 'Error: Not everything is awesome'}))
        .finally(() => process.env.supressErrors = false)
    }, {prefix: 'test'})
  })

  it(`recovers from fail`, () => {
    return runSandboxed(globalFirebase, (firebase) => {
      return set(firebase.child('__internal/writes'), {
        aaa: [{path: ['a', 'aa'], value: 'aaa'},
              {path: ['b', 'bb'], value: 'bbb'}],
        bbb: [{path: ['c', 'cc'], value: 'ccc'}],
      }).then(() => {
        const handler = transactor(firebase, {})
        return handler.stop()
      })
      .then(() => read(firebase.child('a')))
      .then((res) => expect(res).to.deep.equal({aa: 'aaa'}))
      .then(() => read(firebase.child('b')))
      .then((res) => expect(res).to.deep.equal({bb: 'bbb'}))
      .then(() => read(firebase.child('c')))
      .then((res) => expect(res).to.deep.equal({cc: 'ccc'}))
    }, {prefix: 'test', deleteAfter: true})
  })

})
