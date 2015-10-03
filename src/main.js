import Firebase from 'firebase'
import * as u from './useful'
import {transactor, trSummary} from './transactor'
import {Promise} from 'bluebird'
import {set, push, read} from './firebase_actions'
//import {test} from './test/randomized_basics'

const firebaseUrl = 'https://4gu.firebaseio.com'
const firebase = new Firebase(firebaseUrl)

function test2({trCount, baseCredit, userCount, maxWait}) {

  function randomDelay(maxWait) {
    return (val) => Promise.delay(Math.round(Math.random() * maxWait))
  }

  const handlers = {
    pay: ({read, set, push}, data) => {
      let wait = Math.round(Math.random() * maxWait)
      let userFrom, userTo
      return read(['user', data.userFrom])
      .then((_userFrom) => userFrom = _userFrom)
      .then(randomDelay(wait))
      .then(() => read(['user', data.userTo]))
      .then((_userTo) => userTo = _userTo)
      .then(randomDelay(wait))
      .then(() => set(['user', data.userFrom],
        {
          ... userFrom,
          credit: userFrom.credit - data.credit,
          trCount: userFrom.trCount + 1,
        }))
      .then(randomDelay(wait))
      .then(() => set(['user', data.userTo],
        {
          ... userTo,
          credit: userTo.credit + data.credit,
          trCount: userTo.trCount + 1,
        }))


      //.then(() => set(['user', data.userFrom, 'credit'], userFrom.credit - data.credit))
      //.then(randomDelay(wait))
      //.then(() => set(['user', data.userFrom, 'trCount'], userFrom.trCount + 1))
      //.then(randomDelay(wait))
      //.then(() => set(['user', data.userTo, 'credit'], userTo.credit + data.credit))
      //.then(randomDelay(wait))
      //.then(() => set(['user', data.userTo, 'trCount'], userTo.trCount + 1))
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

    //const credit = Math.floor(Math.random() * 100)
    const credit = 10
    return {type: 'pay', data: {userFrom, userTo, credit}}
  }

  function run() {
    let toWait = []
    toWait.push(set(firebase, null))
    toWait.push(set(firebase.child('__internal/fbkeep'), 'fbkeep'))

    const userRef = firebase.child('user')
    const usersIds = []
    u.repeat(userCount, (i) => {
      usersIds.push(i)
      let user = getRandomUser()
      user.id = i
      toWait.push(set(userRef.child(i), user))
    })

    const transactionRef = firebase.child('transaction')
    for (let i = 0; i < trCount; i++) {
      toWait.push(push(transactionRef, getRandomTransaction(usersIds)))
    }

    return Promise.all(toWait).then((_) => {
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
    //.then(() => Promise.delay(1000))
    .then((_) => read(firebase.child('user')))
    .then((users) => {
      let sumCredit = u.sum(u.toArr(users).map(([_, user]) => user.credit))
      let sumTrCount = u.sum(u.toArr(users).map(([_, user]) => user.trCount)) / 2.0
      console.log('trSummary', trSummary)
      console.log('sumCredit', sumCredit, userCount * baseCredit)
      console.log('sumTrCount', sumTrCount, trCount)
      return {sumCredit, sumTrCount}
    })
  }

  return run()
}

//const settings = {trCount: 1000, baseCredit: 1000, userCount: 100, maxWait: 100}
const settings = {trCount: 100, baseCredit: 1000, userCount: 100, maxWait: 300}
test2(settings)
//test(settings)
//  .then(({sumCredit, sumTrCount, trSummary}) => {
//     console.log('sumCredit', sumCredit)
//     console.log('sumTrCount', sumTrCount / 2)
//   })
