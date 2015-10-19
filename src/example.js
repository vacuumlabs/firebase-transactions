import Firebase from 'firebase'
import {test} from './test/randomized_complex'
import {runSandboxed} from './firebase_useful'

const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebaseGlobal = new Firebase(firebaseUrl)

runSandboxed(firebaseGlobal, (firebase) => {
  return test(firebase.child('example'), {trCount: 100, baseCredit: 100, maxTrCredit: 100, userCount: 20, maxWait: 0})
  .then((res) => {
    console.log(res)
  }).then(() => process.exit())
}, {prefix: 'example', deleteAfter: false})
