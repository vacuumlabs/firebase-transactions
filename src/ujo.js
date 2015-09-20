import * as i from 'immutable'
import * as scheduler from './scheduler'
import * as accountant from './accountant'

export function run() {
  return scheduler
    .getOne()
    .then(transaction)
    .then((_) => run())
}

export function transact(transaction, firebase, actions, capacity=10, retryAfter=200) {
  let {action, payload, id} = transaction
  let dtime = id == null ? 0 : retryAfter
  return new Promise((resolve, reject) => {
    let fn = () => {
      let id = accountant.open(id)
      return actions[action](
          (path) => read(id, path),
          (path) => write(id, path),
          (path) => push(id, path),
          payload
        )
        .then((_) => commit(id))
        .then((_) => accountant.cleanup(id))
        .then((_) => waitForProcessing(id))
        .then(resolve)
        .catch(reject)
    }
    scheduler.schedule({fn, time: new Date().getTime() + dtime})
  })
}

let pendingWrites = {}

function read(id, ref) {
  if (!accountant.isInProgress(id)) return
  if (!accountant.canRead(id)) {
    accountant.abort(id)
    scheduler.schedule(
    if (!accountant.inProgress(id)
  }

  {timestamp, transaction} registered.get(id)
  
  
  ak abort, skus znovu


  // check for possible conflicts
  for (let i=
  if (writesByRef.hasIn(ref)) throw {isLockError: true}
  

  // lock ref for writing

  // read the value from firebase (if necessary) and merge with this
  // transaction's writes
}

function write(id, ref) {
  // check for possible conflicts

  // lock ref for reading

  // add the value to this transaction's writes
}

function push(id, ref) {
  // get firebase ref; use write
}

function commit(id) {
  // TODO add writes to pendingWrites
  cleanup(id)
}
