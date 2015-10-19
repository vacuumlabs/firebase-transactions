import Firebase from 'firebase'
import {test} from './test/randomized_complex'

const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebase = new Firebase(firebaseUrl)

test(firebase.child('example'), {trCount: 100, baseCredit: 100, maxTrCredit: 100, userCount: 20, maxWait: 0})
.then((res) => {
  console.log(res)
})
.then(() => process.exit())
