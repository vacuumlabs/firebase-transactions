import Firebase from 'firebase'
import {Promise} from 'bluebird'
import {fromJS} from 'immutable'
import * as u from '../useful'
import {transactor} from '../transactor'
import {read, set, push} from '../firebase_actions'
import {TODO_TRX_PATH, DONE_TRX_PATH} from '../settings'

const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebase = new Firebase(firebaseUrl)

export function test({trCount, baseCredit, maxTrCredit, userCount, maxWait}) {

  function randomDelay(maxWait) {
    return (val) => Promise.delay(Math.round(Math.random() * maxWait))
  }

  const pay = ({read, set, push, abort}, data) => {
    let wait = Math.round(Math.random() * maxWait)
    let creditFrom, creditTo
    return read(['user', data.userFrom, 'credit'])
    .then((_creditFrom) => creditFrom = _creditFrom)
    .then(randomDelay(wait))
    .then(() => read(['user', data.userTo, 'credit']))
    .then((_creditTo) => creditTo = _creditTo)
    .then(randomDelay(wait))
    .then(() => set(['user', data.userFrom, 'credit'], creditFrom - data.credit))
    .then(randomDelay(wait))
    .then(() => set(['user', data.userTo, 'credit'], creditTo + data.credit))
    .then(() => read(['user', data.userFrom, 'credit']))
    .then((credit) => {
      if (credit < 0) {
        abort('not enough funds')
      }
    })
  }

  const handlers = {
    pay,
  }


  function getRandomUser() {
    return {
      name: 'johny_' + Math.random().toString(36).substring(7),
      credit: baseCredit,
    }
  }

  function getRandomTransaction(usersIds) {
    const userFrom = u.randomChoice(usersIds)
    let userTo
    while (true) {
      userTo = u.randomChoice(usersIds)
      if (userTo !== userFrom) {
        break
      }
    }

    const credit = u.randRange(maxTrCredit)
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

    const transactionRef = firebase.child(TODO_TRX_PATH)
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
        firebase.child(DONE_TRX_PATH).on('child_added', () => {
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
      users = fromJS(users)
      let creditSeq = users.valueSeq().map((user) => user.get('credit'))
      let sumCredit = u.sum(creditSeq)
      let minCredit = Math.min.apply(null, creditSeq.toJS())
      return {sumCredit, minCredit, trSummary: handler.trSummary}
    })
  }

  return run()
}

