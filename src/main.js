//import {Map, List, fromJS} from 'immutable'
import Firebase from 'firebase'
//import transactor from './naive_transactor'
import * as u from './useful'
import {transactor, trSummary} from './transactor'
import {Promise} from 'bluebird'
import {read} from './firebase_actions'
const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebase = new Firebase(firebaseUrl)

const trCount = 1000
const baseCredit = 1000000
const userCount = 100

function randomDelay(val) {
  return Promise.delay(Math.round(Math.random() * 10))
  //return Promise.delay(0)
    .then(() => val)
}

const handlers = {
  pay: ({read, set, push}, data) => {
    let userFrom, userTo
    return read(['user', data.userFrom])
    .then((_userFrom) => {
      userFrom = _userFrom
    })
    .then(randomDelay)
    .then(() => read(['user', data.userTo]))
    .then(randomDelay)
    .then((_userTo) => {
      userTo = _userTo
      return set(['user', data.userFrom, 'credit'], userFrom.credit - data.credit)
    })
    .then(() => set(['user', data.userFrom, 'trCount'], userFrom.trCount + 1))
    .then(randomDelay)
    .then(() => {
      return set(['user', data.userTo, 'credit'], userTo.credit + data.credit)
    })
    .then(() => set(['user', data.userTo, 'trCount'], userTo.trCount + 1))
  }
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getRandomUser() {
  return {
    name: 'johny_' + Math.random().toString(36).substring(7),
    credit: baseCredit,
    trCount: 0,
  }
}

function getRandomTransaction(usersIds) {
  const userFrom = randomChoice(usersIds)
  let userTo
  while (true) {
    userTo = randomChoice(usersIds)
    if (userTo !== userFrom) {
      break
    }
  }


  const credit = Math.floor(Math.random() * 100)
  return {type: 'pay', data: {userFrom, userTo, credit}}
}

function demo() {
  firebase.set(null)
  firebase.child('__internal/fbkeep').set('fbkeep')

  const userRef = firebase.child('user')
  const usersIds = []
  u.repeat(userCount, (i) => {
    usersIds.push(i)
    let user = getRandomUser()
    user.id = i
    userRef.child(i).set(user)
  })

  const transactionRef = firebase.child('transaction')
  for (let i = 0; i < trCount; i++) {
    transactionRef.push(getRandomTransaction(usersIds))
  }

  Promise.delay(1000).then((_) => {
    let processedCount = 0
    // start transactor; process all submitted transactions
    transactor(firebase, handlers)
    // completes, when we have ${trCount} closed transactions
    return new Promise((resolve, reject) => {
      firebase.child('closed_transactions').on('child_added', () => {
        processedCount += 1
        if (processedCount === trCount) {
          resolve()
        }
      })
    })
  })
  .then((_) => Promise.delay(1000))
  .then((_) => read(firebase.child('user')))
  .then((users) => {
    let sumCredit = u.sum(u.toArr(users).map(([_, user]) => user.credit))
    let sumTrCount = u.sum(u.toArr(users).map(([_, user]) => user.trCount)) / 2.0
    console.log('trSummary', trSummary)
    console.log('sumCredit', sumCredit, userCount * baseCredit)
    console.log('sumTrCount', sumTrCount, trCount)
  })

}

demo()


