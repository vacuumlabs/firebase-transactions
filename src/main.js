//import {Map, List, fromJS} from 'immutable'
import Firebase from 'firebase'

const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebase = new Firebase(firebaseUrl)

var rand = myArray[Math.floor(Math.random() * myArray.length)];

function getRandomUser() {
  return {
    name: 'johny_' + Math.random().toString(36).substring(7),
    credit: 1000000
  }
}

function getRandomTransaction(userIds) {
}

function demo() {
  firebase.set(null)
  const userRef = firebase.child('user')
  const usersIds = []
  for (let i = 0; i < 100; i++) {
    usersIds.push(userRef.push(getRandomUser()))
  }

  const transactionRef = firebase.child('transaction')
  for (let i = 0; i < 1000; i++) {
    transactionRef.push(getRandomTransaction(usersIds))
  }

}

demo()

//transactor(firebase, {
//  'payOrder': (read, write, push) => {},
//  'transferMoney': (read, write, push) => {},
//}).run()

