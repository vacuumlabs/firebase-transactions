import {Promise} from 'bluebird'
import {TODO_TRX_PATH, DONE_TRX_PATH} from './settings'
import {push} from './firebase_useful'

/***
 * ## Client
 *
 * #### getClient(firebase, options = {})
 *
 *   Constructs client that is used for submitting queries
 *
 *     args:
 *       firebase: firebase ref
 *       options (optional):
 *         todoTrxRef: where to put to-be-processed transactions
 *         doneTrxRef: where finished tansactions are expected to be put
 *
 *     returns:
 *       *submitTransaction* function
 *
 * #### submitTransaction(type, data)
 *     args:
 *       type: string, matches with handler type
 *       data: any firebase-serializable JS object describing the transaction
 ***/
export function getClient(firebase, options = {}) {
  const {
    todoTrxRef = firebase.child(TODO_TRX_PATH),
    doneTrxRef = firebase.child(DONE_TRX_PATH)
  } = options
  return (type, data) => {
    const trxId = push(todoTrxRef, {type, data}).key()
    let resultRef = doneTrxRef.child(trxId)
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
