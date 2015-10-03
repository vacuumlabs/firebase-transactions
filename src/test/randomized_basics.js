import Firebase from 'firebase'
import {Promise} from 'bluebird'
import * as u from '../useful'
import {transactor, trSummary} from '../transactor'
import {read, set, push} from '../firebase_actions'

const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebase = new Firebase(firebaseUrl)

export function test({trCount, baseCredit, userCount, maxWait, handlerNames}) {

  function randomDelay(maxWait) {
    return (val) => Promise.delay(Math.round(Math.random() * maxWait))
  }

  const payDeep = ({read, set, push}, data) => {
    let wait = Math.round(Math.random() * maxWait)
    let userFrom, userTo
    return read(['user', data.userFrom])
    .then((_userFrom) => userFrom = _userFrom)
    .then(randomDelay(wait))
    .then(() => read(['user', data.userTo]))
    .then((_userTo) => userTo = _userTo)
    .then(randomDelay(wait))
    .then(() => set(['user', data.userFrom, 'credit'], userFrom.credit - data.credit))
    .then(randomDelay(wait))
    .then(() => set(['user', data.userFrom, 'trCount'], userFrom.trCount + 1))
    .then(randomDelay(wait))
    .then(() => set(['user', data.userTo, 'credit'], userTo.credit + data.credit))
    .then(randomDelay(wait))
    .then(() => set(['user', data.userTo, 'trCount'], userTo.trCount + 1))
  }

  const pay = ({read, set, push}, data) => {
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
  }


  function makeValidated(payHandler) {
    return (fns, data) => {
      //console.log('data', data)
      return payHandler(fns, data)
        .then(() => fns.read(['user', data.userFrom, 'credit']))
        .then((credit) => {
          if (credit < 0) {
            fns.abort('not enough funds')
          }
        })
    }
  }

  const handlers = {
    pay,
    payDeep,
    payValidated: makeValidated(pay),
    payDeepValidated: makeValidated(payDeep),
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
    return {type: u.randomChoice(handlerNames), data: {userFrom, userTo, credit}}
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

    let handler

    return Promise.all(toWait).then((_) => {
      let processedCount = 0
      // start transactor; process all submitted transactions
      handler = transactor(firebase, handlers)
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
    .then((_) => read(firebase.child('user')))
    .then((users) => {
      handler.stop()
      let sumCredit = u.sum(u.toArr(users).map(([_, user]) => user.credit))
      let sumTrCount = u.sum(u.toArr(users).map(([_, user]) => user.trCount))
      return {sumCredit, sumTrCount, trSummary}
    })
  }

  return run()
}

