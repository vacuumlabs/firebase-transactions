import {Promise} from 'bluebird'
import {Registry} from './registry'
import {Set} from 'immutable'
import * as u from './useful'
import * as fba from './firebase_actions'
import log4js from 'log4js'

let logger = log4js.getLogger('transactor')

function configureLogging() {
  if (!log4js.configured) {
    log4js.configure({
      appenders: [{
        type: 'console',
        layout: {
          type: 'pattern',
          pattern: '[%[%5.5p%]] - %m'
        }
      }]
    })
    logger.setLevel('WARN')
  }
}

// when aborted transaction should be rescheduled; in milliseconds
const rescheduleDelay = 100

class AbortError {
  constructor(msg) {
    this.msg = msg
  }
}

export const trSummary = {}
export const registry = new Registry()

export function transactor(firebase, handlers) {

  if (!log4js.configured) configureLogging()

  const inProcess = {}
  const trCountLimit = 30
  const waiting = []
  let nextTrId = 0
  let nextRunId = 0
  let trCount = 0

  function logTrSummary(id, op) {
    let trId = inProcess[id].id
    if (trSummary[trId] == null) {
      trSummary[trId] = {'try': 0, 'abort': 0, 'process': 0}
    }
    trSummary[trId][op]++
  }

  function refFromPath(path) {
    return firebase.child(path.join('/'))
  }

  function pushWaiting(val) {
    if (val == null) {
      throw new Error('val should be trx, not null/undefined')
    }
    waiting.push(val)
    tryConsumeWaiting()
  }

  /*
   * arg: transaction id
   * input:
   *   transaction must be 'inProcess'
   * output:
   *   transaction won't be 'inProcess'
   *   all subsequent reads and writes of this transaction will throw AbortError
   *   if the transaction doesn't do any read / writes and just finished, it'll throw
   */
  function abort(id) {
    if (inProcess[id] == null) {
      throw new Error('shouldnt abort transaction that is already aborted')
    }
    logTrSummary(id, 'abort')
    let trData = inProcess[id]
    registry.cleanup(id)
    delete inProcess[id]
    logger.debug(`CLEANUP & ABORT : tr no ${id}`)
    console.log(`CLEANUP & ABORT : tr no ${id}`)
    // if tansaction is aborted, re-schedule it after some delay
    setTimeout(() => {pushWaiting(trData)}, rescheduleDelay)
  }

  function process(trData) {
    logger.debug(`starting process ${trData.id}`)
    const {type, data} = trData
    const id = nextRunId++
    const handler = handlers[type]
    if (handler == null) {
      throw new Error(`handler for type ${type} does not exist. Full trData: ${trData}`)
    }

    function checkAbort() {
      //logger.debug(`Checking abort id: ${id}, inProcess: ${inProcess[id]}`)
      if (inProcess[id] == null) {
        logger.debug('checkAbort: throwing')
        throw new AbortError('Transaction was aborted')
      }
    }

    function handlePossibleConflict(_conflict) {
      if (_conflict.constructor !== Set) {
        throw new Error('conflict must be of a type immutable.Set')
      }
      checkAbort()
      let conflict = _conflict.delete(id)
      if (!conflict.isEmpty()) {
        if (u.any(conflict, (i) => (inProcess[i] == null)) ||
            conflict.minBy((i) => inProcess[i].trId) === id) {
          logger.debug(`aborting ${id}, because of ${conflict}, finishing: ${conflict.filter((c) => inProcess[c] == null)}`)
          abort(id)
        } else {
          logger.debug(`aborting ${conflict}, because of ${id}`)
          conflict.forEach(abort)
        }
      }
      checkAbort()
    }

    // TODO if possible, make DB operations accept also firebase ref
    function read(path) {
      handlePossibleConflict(registry.conflictingWithRead(path))
      console.log(`ADDING READ trid: ${id} path: ${path}`)
      registry.addRead(id, path)
      return Promise.resolve()
        .then(() => fba.read(refFromPath(path)))
        // XXX
        //.then((val) => {
        //  return registry.readAsIfTrx(id, path, val)
        //})
    }

    function set(path, value) {
      handlePossibleConflict(registry.conflictingWithWrite(path))
      registry.addWrite(id, path, value)
    }

    if (inProcess[id] != null) {
      throw new Error('processing transaction which is already inProcess')
    }

    // RETURN
    inProcess[id] = trData
    return Promise.resolve()
      .then(() => {
        logger.debug(`starting handler ${id}`)
        logTrSummary(id, 'try')
        return handler({set, read}, data)
      })
      .then(() => {
        checkAbort()
        logger.debug(`FINISH: tr no ${id}`)
        let writes = registry.writesByTrx.get(id)
        let writesRef = firebase.child('__internal/writes').child(id)
        // synchronous variant of 'apply-transaction' code. Asynchronous variant is
        // at the bottom of this file; currently this cannot be currently used, see
        // coment there.
        logTrSummary(id, 'process')
        delete inProcess[id]
        let toWait = []
        toWait.push(fba.set(writesRef, writes))
        writes.forEach((write) => {
          // TODO immutable destructuring
          toWait.push(fba.set(refFromPath(write.get('path')), write.get('value')))
        })
        Promise.all(toWait).then((_) => {
          fba.remove(writesRef)
          fba.set(firebase.child('closed_transactions').child(trData.frbId), trData)
          fba.remove(firebase.child('transaction').child(trData.frbId))
          console.log(`FINISHING CLEANUP ${id}`)
          registry.cleanup(id)
        })

      })
      .catch((err) => {
        if (err instanceof AbortError) {
          logger.debug(`abort error ${id}`)
          return
        }
        throw err
      })
  }

  function tryConsumeWaiting() {
    while (waiting.length > 0 && trCount < trCountLimit) {
      trCount += 1
      let trData = waiting.shift()
      process(trData)
        .then(() => {
          trCount -= 1
          tryConsumeWaiting()
        })
    }
  }

  firebase.child('transaction').on('child_added', (childSnapshot, prevChildKey) => {
    let trData = childSnapshot.val()
    if (trData.type == null) {
      logger.error('malformed data: ', trData)
      throw new Error('malformed trData')
    }
    trData.trId = nextTrId++
    logger.debug(`SCHEDULED: tr no ${trData.trId} data: ${JSON.stringify(trData)}`)
    trData.frbId = childSnapshot.key()
    pushWaiting(trData)
  })

}

// Asynchronous variant of 'transaction-apply' phase. Sadly, because bug in Firebase
// (or maybe just lack of guarantees provided by Firebase? It's hard to say, the spec
// is fuzzy), this leads to errors (transaction behavior is not guaranteed)
//
//logTrSummary(id, 'process')
//delete inProcess[id]
//fba.set(writesRef, writes)
//writes.forEach((write) => {
//  fba.set(refFromPath(write.get('path')), write.get('value'))
//})
//fba.remove(writesRef)
//fba.set(firebase.child('closed_transactions').child(trData.frbId), trData)
//fba.remove(firebase.child('transaction').child(trData.frbId))
//registry.cleanup(id)

