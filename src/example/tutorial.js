import Firebase from 'firebase'
import {getClient} from '../client'
import * as u from '../useful'
import {transactor} from '../transactor'
import {set} from '../firebase_useful'

const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebaseGlobal = new Firebase(firebaseUrl)
const firebase = firebaseGlobal.child(`tutorial ${new Date()}`)

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

const userCount = 100
const trCount = 1000

function getRandomTransaction() {
  const userFrom = u.randRange(userCount)
  // userTo will be different from userTo
  const userTo = (userFrom + u.randRange(userCount - 1)) % userCount
  const credit = u.randRange(100)
  return {type: 'pay', data: {userFrom, userTo, credit}}
}

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

const submitTrx = getClient(firebase)

for (let i = 0; i < trCount; i++) {
  submitTrx(getRandomTransaction(usersIds))
}

transactor(firebase, {pay})


