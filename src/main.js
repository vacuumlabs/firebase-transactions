//import {Map, List, fromJS} from 'immutable'
import Firebase from 'firebase'
//import transactor from './naive_transactor'
import {transactor} from './transactor'
const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebase = new Firebase(firebaseUrl)


const handlers = {
  pay: ({read, set, push}, data) => {
    let userFrom, userTo
    //console.log('processing', data)
    return read(['user', data.userFrom])
    .then((_userFrom) => {
      userFrom = _userFrom
      return read(['user', data.userTo])
    }).then((_userTo) => {
      userTo = _userTo
      return set(['user', data.userFrom, 'credit'], userFrom.credit - data.credit)
    }).then(() => {
      return set(['user', data.userTo, 'credit'], userTo.credit + data.credit)
    })
  }
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getRandomUser() {
  return {
    name: 'johny_' + Math.random().toString(36).substring(7),
    credit: 1000000
  }
}

function getRandomTransaction(usersIds) {
  const userFrom = randomChoice(usersIds)
  const userTo = randomChoice(usersIds)
  const credit = Math.floor(Math.random() * 100)
  return {type: 'pay', data: {userFrom, userTo, credit}}
}

function demo() {
  firebase.set(null)
  const userRef = firebase.child('user')
  const usersIds = []
  for (let i = 0; i < 100; i++) {
    usersIds.push(userRef.push(getRandomUser()).key())
  }

  const transactionRef = firebase.child('transaction')
  for (let i = 0; i < 10000; i++) {
    transactionRef.push(getRandomTransaction(usersIds))
  }

  transactor(firebase, handlers)

}

demo()


