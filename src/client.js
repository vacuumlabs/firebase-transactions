import {Promise} from 'bluebird'
import {TODO_TRX_PATH, DONE_TRX_PATH} from './settings'
import {push} from './firebase_useful'

export function getClient(firebase, options = {}) {
  let {todoTrxPath = TODO_TRX_PATH, doneTrxPath = DONE_TRX_PATH} = options
  let submitRef = firebase.child(todoTrxPath)
  return (type, data) => {
    const trxId = push(submitRef, {type, data}).key()
    let resultRef = firebase.child(doneTrxPath).child(trxId)
    return new Promise((resolve, reject) => {
      let fn = resultRef.on('value', (snap) => {
        // after subscription, we first got 'null' value so
        // we have to ignore this
        if (snap.val() != null) {
          resolve(snap.val().result)
          resultRef.off('value', fn)
        }
      })
    })
  }
}
