import Firebase from 'firebase'
import {expect} from 'chai'
import {runSandboxed, set, read} from '../firebase_useful'
import {getClient} from '../client'
import {transactor} from '../transactor'
import {firebaseUrl} from '../settings'

describe('transactor', function() {
  it(`change`, () => {
    const globalFirebase = new Firebase(firebaseUrl)
    return runSandboxed(globalFirebase, (firebase) => {
      const submitTrx = getClient(firebase)
      set(firebase.child('obj'), {'val': 1})
      const incByOne = ({change}, data) => {
        return change(['obj', 'val'], (x) => x + 1)
      }
      transactor(firebase, {incByOne})
      return submitTrx({type: 'incByOne', data: {}})
        .then((_) => read(firebase.child('obj/val')))
        .then((val) => expect(val).to.equal(2))
    }, {prefix: 'test', deleteAfter: true})
  })

  it(`result`, () => {
    const globalFirebase = new Firebase(firebaseUrl)
    return runSandboxed(globalFirebase, (firebase) => {
      const submitTrx = getClient(firebase)
      const returnHello = ({}, data) => 'hello'
      transactor(firebase, {returnHello})
      return submitTrx({type: 'returnHello', data: {}})
        .then((res) => expect(res).to.equal('hello'))
    }, {prefix: 'test', deleteAfter: true})
  })

})
