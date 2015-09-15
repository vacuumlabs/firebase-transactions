export function transact(transaction) {
  return _transact(transaction, null)
}

function _transact(transaction, id) {
  id = id == null ? getId() : id
  return transaction(
      (ref) => read(id, ref),
      (ref) => write(id, ref),
      (ref) => push(id, ref),
    )
    .then((_) => commit(id))
    .then((_) => cleanup(id))
    .catch((e) => {
      if (e.isLockError) {
        cleanup(id)
        // retry with already assigned id
        return _transact(transaction, id)
      }
      else throw e
    })
}

let readsByTrxId = {}
let writesByTrxId = {}
let readsByRef = {}
let writesByRef = {}

function getId() {
  return null
}

function read(id, ref) {
  // check for possible conflicts

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

function cleanup(id) {
  // TODO
}
