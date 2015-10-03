import Firebase from 'firebase'
import Promise from 'bluebird'
import {is, fromJS, Set} from 'immutable'
import {read, set} from './firebase_actions'
import * as u from './useful'

const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebase = new Firebase(firebaseUrl)

firebase.set(null)

const keys = []
const subkeys = []
u.repeat(1000, (i) => {
  keys.push(`key${i}`)
  subkeys.push(`subkey${i}`)
})

const toWait = []
const frb = {}

for (let key of keys) {
  let o = {}
  for (let subkey of subkeys) {
    o[subkey] = u.getRandomValue()
  }
  toWait.push(set(firebase.child(key), o))
  frb[key] = o
}

let inProcess = Set()
let stop = false
let cnt = 0

function testOne() {
  let key = u.randomChoice(keys)
  let subkey = u.randomChoice(subkeys)
  let newval = u.getRandomValue()
  if (!inProcess.includes(key)) {
    inProcess = inProcess.add(key)
    set(firebase.child(key).child(subkey), newval)
    read(firebase.child(key))
    //.then(() => read(firebase.child(key)))
    .then((val) => {
      inProcess = inProcess.delete(key)
      frb[key][subkey] = newval
      let valr = frb[key]
      if (!is(fromJS(valr), fromJS(val))) {
        console.log(valr, val)
        stop = true
        throw new Error('youck fo!')
      } else {
        console.log('ok ' + cnt++)
      }
    })
  }
}

function perform() {
  if (!stop) {
    testOne()
    setTimeout(perform, 0)
  }
}

Promise.all(toWait).then(perform)


