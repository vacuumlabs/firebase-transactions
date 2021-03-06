import i from 'immutable'
import Firebase from 'firebase'
import {Promise} from 'bluebird'

export function runSandboxed(firebase, fn, options = {}) {
  const {deleteAfter = true, prefix = ''} = options
  let fbid = firebase.push().key()
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

export function fromJS(value) {
  if (typeof value.val === 'function') value = value.val()
  return i.fromJS(value)
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

export function getAuth(ref) {return fromJS(ref.getAuth()) }

function _change(ref, method, value) {
  if (!((arguments.length === 3) && (ref instanceof Firebase) && (typeof method === 'string'))) {
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
  if (!((arguments.length === 1) && (ref instanceof Firebase))) {
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

export function createUser(ref, credentials) {
  return promisify((c) => ref.createUser(toJS(credentials), c))
}

export function authWithOAuthPopup(ref, provider, options) {
  return promisify((c) => ref.authWithOAuthPopup(provider, c, toJS(options)))
}

export function authWithPassword(ref, credentials, options) {
  return promisify((c) => ref.authWithPassword(toJS(credentials), c, toJS(options)))
}
