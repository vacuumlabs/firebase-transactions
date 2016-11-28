import {Promise} from 'bluebird'
import Firebase from 'firebase'

export function runSandboxed(firebase, fn, options = {}) {
  const {deleteAfter = true, prefix = ''} = options
  let fbid = firebase.push().key
  let testId = `${prefix}${fbid}`
  let testRef = firebase.child(testId)
  return Promise.resolve()
    .then(() => fn(testRef))
    .finally((_) => {
      if (deleteAfter) set(testRef, null)
    })
}

export function toJS(value) {
  return (value && value.toJS) ? value.toJS() : value
}

export function promisify(callback) {
  return new Promise((resolve, reject) => {
    // On failure, the first argument will be an Error object indicating the
    // failure, with a machine-readable code attribute. On success, the first
    // argument will be null and the second can be an object containing result.
    callback((error, data) => {
      if (error) {
        reject(error)
        return
      }
      resolve(data)
    })
  })
}

export function getAuth(ref) {return ref.auth.currentUser}

function _change(ref, method, value) {
  if (!((arguments.length === 3) && (typeof method === 'string'))) {
    throw new Error(`bad arguments for '_change' function, got ${ref} ${method} ${value}`)
  }
  return promisify((c) => ref[method](toJS(value), c))
}

export function set(ref, value) {return _change(ref, 'set', value) }

export function update(ref, value) {return _change(ref, 'update', value) }

export function remove(ref) {return promisify((c) => ref.remove(c)) }

export function push(ref, value, onComplete) {return ref.push(toJS(value), onComplete) }

export function once(ref, eventType) {
  return new Promise((resolve, reject) => ref.once(eventType, resolve, reject))
}

export function read(ref) {
  if (!((arguments.length === 1))) {
    throw new Error(`bad arguments for 'read' function, got ${arguments}`)
  }
  return new Promise((resolve, reject) => ref.once('value', (snap) => {resolve(snap.val())}, reject))
}

// This only reads and sets the value on given `ref` in two, not necessarily consequent rounds. i
// It does not provide such guarantees as a regular transaction - use carefully.
export function change(ref, updateFunction) {
  return read(ref).then(updateFunction).then((result) => result != null ? set(ref, result) : null)
}

// This function guarantees idempotency of transactions - given a transactionId, this
// transaction will never be executed more than once even if repeated upon system crash.
// However, a key `lastId` is forbidden to change in the transaction.
export function transact(transactionId, ref, updateFunction) {
  return change(ref, (snapshot) => {
    const {lastId} = snapshot || {lastId: null}
    if (lastId === transactionId) return null
    else return {...snapshot, ...updateFunction(snapshot), lastId: transactionId}
  })
}

export function createUser(ref, _credentials) {
  const credentials = toJS(_credentials)
  return ref.auth.createUser
    ? ref.auth.createUser(credentials)
    : ref.auth.createUserWithEmailAndPassword(credentials.email, credentials.password)
}

const providers = {
  facebook: Firebase.auth.FacebookAuthProvider,
  twitter: Firebase.auth.TwitterAuthProvider,
  google: Firebase.auth.GoogleAuthProvider,
}

export function authWithOAuthPopup(ref, provider) {
  return Promise.resolve(ref.auth.signInWithPopup(new (providers[provider])()))
}

export function authWithPassword(ref, credentials) {
  const {email, password} = toJS(credentials)
  return Promise.resolve(ref.auth.signInWithEmailAndPassword(email, password))
}
