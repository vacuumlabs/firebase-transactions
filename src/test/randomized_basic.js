import {Promise} from 'bluebird'
import {fromJS} from 'immutable'
import {getClient} from '../client'
import * as u from '../useful'
import {transactor} from '../transactor'
import {read, set} from '../firebase_useful'

export function test(firebase, {trCount, baseCredit, maxTrCredit, userCount, maxWait}) {

  function randomDelay(maxWait) {
    return (val) => Promise.delay(u.randRange(maxWait))
  }

  const pay = ({read, set, push, abort}, data) => {
    let wait = u.randRange(maxWait)
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
      name: 'johny_' + u.randRange(100000, 999999).toString(36),
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
    return {userFrom, userTo, credit}
  }

  function run() {
    const toWait = []
    const toFinish = []
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

    const submitTrx = getClient(firebase)

    for (let i = 0; i < trCount; i++) {
      toFinish.push(submitTrx('pay', getRandomTransaction(usersIds)))
    }

    let handler

    return Promise.all(toWait).then((_) => {
      // start transactor; process all submitted transactions
      handler = transactor(firebase, handlers)
    }).then((_) => Promise.all(toFinish))
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

