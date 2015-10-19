import Firebase from 'firebase'
import {expect} from 'chai'
import {runSandboxed, set, read} from '../firebase_useful'
import {getClient} from '../client'
import {transactor} from '../transactor'

describe('transactor', function() {
  it(`updateBy, result`, () => {
    const firebaseUrl = 'https://gugugu.firebaseio.com'
    const globalFirebase = new Firebase(firebaseUrl)
    return runSandboxed(globalFirebase, (firebase) => {
      const submitTrx = getClient(firebase)
      set(firebase.child('obj'), {'val': 1})
      const incByOne = ({change}, data) => {
        return change(['obj', 'val'], (x) => x + 1)
          .then((_) => 'hello')
      }
      transactor(firebase, {incByOne})
      return submitTrx({type: 'incByOne', data: {}})
        .then((res) => expect(res).to.equal('hello'))
        .then((_) => read(firebase.child('obj/val')))
        .then((val) => expect(val).to.equal(2))
    }, {prefix: 'test', deleteAfter: false})
  })
})

