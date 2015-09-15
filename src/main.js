import {Map, List, fromJS} from 'immutable'
import Firebase from 'firebase'

const firebaseUrl = 'https://gugugu.firebaseio.com'

function merge(ref){}

function fbdemo(){
  const firebase = new Firebase(firebaseUrl)
  //firebase.set(null)
  for (let i = 0; i < 10000; i++) {
    firebase.child('data').push({v: i, sq: i * i}, (err) => console.log(err)) //eslint-disable-line no-loop-func
    console.log(i)
  }
}

fbdemo()

//console.log(fromJS({a:'b'}))
