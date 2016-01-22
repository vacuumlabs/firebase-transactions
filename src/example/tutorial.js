// begin-fragment setup
import Firebase from 'firebase'
import {getClient} from 'firebase-transactions'
import {transactor} from 'firebase-transactions'
import {firebaseUseful} from 'firebase-transactions'

// promisified Firebase.set
const {set} = firebaseUseful
const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebaseGlobal = new Firebase(firebaseUrl)
const firebase = firebaseGlobal.child(`tutorial ${new Date()}`)

function randRange(from, to) {
  return from + Math.floor(Math.random() * (to - from))
}

const userCount = 100
const trCount = 1000
// end-fragment setup

// begin-fragment pay
const pay = ({read, set, push, abort, change}, data) => {
  return change(['user', data.userFrom, 'credit'], (c) => c - data.credit)
  .then(() => change(['user', data.userTo, 'credit'], (c) => c + data.credit))
  .then(() => read(['user', data.userFrom, 'credit']))
  .then((credit) => {
    if (credit < 0) {
      abort('not enough funds')
    }
  })
}
// end-fragment pay

// begin-fragment populate
let toWait = []
set(firebase, null)
// to avoid annoying flickering of firebase in-browser explorer,
// keep at least one record in the collection
toWait.push(set(firebase.child('__internal/fbkeep'), 'fbkeep'))
const userRef = firebase.child('user')
const usersIds = []
for (let i = 0; i < userCount; i++) {
  usersIds.push(i)
  let user = {name: `Johny${i}`, credit: 100}
  set(userRef.child(i), user)
}
// end-fragment populate

// begin-fragment create_client
const submitTrx = getClient(firebase)
// end-fragment create_client

// begin-fragment submit_transactions
function getRandomPayTransaction() {
  const userFrom = randRange(0, userCount)
  // userTo will be different from userTo
  const userTo = (userFrom + randRange(0, userCount - 1)) % userCount
  const credit = randRange(0, 100)
  return {userFrom, userTo, credit}
}

for (let i = 0; i < trCount; i++) {
  submitTrx('pay', getRandomPayTransaction(usersIds))
}
// end-fragment submit_transactions

// begin-fragment run_transactor
transactor(firebase, {pay})
// end-fragment run_transactor

