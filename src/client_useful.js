import {DONE_TRX_PATH} from './settings'

export function readTransactionResult(firebase, trxId,
  closedTrxPath = DONE_TRX_PATH) {
  let fn
  let ref = firebase.child(closedTrxPath).child(trxId)

  return new Promise((resolve, reject) => {
    fn = ref.on('value', (snap) => {
      if (snap.val() != null) resolve(snap.val().result)
    })
  }).then((result) => {
    ref.off('value', fn)
    return result
  })
}
