import {Promise} from 'bluebird'
import {Registry} from './registry'
import {Set} from 'immutable'
import * as u from './useful'
import {read, set, remove} from './firebase_actions'
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
    logger.setLevel('DEBUG')
  }
}

// when aborted transaction should be rescheduled; in milliseconds
const rescheduleDelay = 100

class AbortError {
  constructor(msg) {
    this.msg = msg
  }
}

class UserAbort {
  constructor(msg) {
    this.msg = msg
  }
}


export function transactor(firebase, handlers) {

  if (!log4js.configured) configureLogging()

  const inProcess = {}
  const finishing = {}
  const trCountLimit = 30
  const waiting = []
  const trSummary = {}
  const registry = new Registry()
  let nextTrId = 0
  let nextRunId = 0
  let trCount = 0

  function _abort(id) {
    registry.cleanup(id)
    delete inProcess[id]
  }


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
  // --abortAndReschedule
  function abortAndReschedule(id) {
    if (inProcess[id] == null) {
      throw new Error('shouldnt abort transaction that is already aborted')
    }
    logger.debug(`CLEANUP & ABORT : tr no ${id}`)
    logTrSummary(id, 'abort')
    let trData = inProcess[id]
    _abort(id)
    // if tansaction is aborted, re-schedule it after some delay
    setTimeout(() => {pushWaiting(trData)}, rescheduleDelay)
  }

  // --processTr
  function processTr(id, trData) {
    logger.debug(`starting process ${trData.id}`)
    const {type, data} = trData
    const handler = handlers[type]
    if (handler == null) {
      throw new Error(`handler for type ${type} does not exist. Full trData: ${trData}`)
    }

    if (inProcess[id] != null) {
      throw new Error('processing transaction which is already inProcess')
    }

    inProcess[id] = trData
    let userAborted = false
    return Promise.resolve()
      .then(() => {
        logger.debug(`starting handler ${id}`)
        logTrSummary(id, 'try')
        return handler({
          set: userSet,
          read: userRead,
          abort: userAbort
        }, data)
      })
      .catch((err) => {
        if (err instanceof UserAbort) {
          logger.debug(`user abort ${id}, msg: ${err.msg}`)
          userAborted = true
          return
        }
        throw err
      })
      .then(() => {
        checkAbort()
        logger.debug(`FINISH: tr no ${id}`)
        let writes = userAborted ? [] : registry.writesByTrx.get(id)
        let writesRef = firebase.child('__internal/writes').child(id)
        // synchronous variant of 'apply-transaction' code. Asynchronous variant is
        // at the bottom of this file; currently this cannot be currently used, see
        // coment there.
        logTrSummary(id, 'process')
        finishing[id] = true
        let toWait = []
        toWait.push(set(writesRef, writes))
        writes.forEach((write) => {
          // TODO immutable destructuring
          toWait.push(set(refFromPath(write.get('path')), write.get('value')))
        })
        Promise.all(toWait).then((_) => {
          remove(writesRef)
          set(firebase.child('closed_transactions').child(trData.frbId), trData)
          remove(firebase.child('transaction').child(trData.frbId))
          registry.cleanup(id)
          delete inProcess[id]
          delete finishing[id]
        })

      })
      .catch((err) => {
        if (err instanceof AbortError) {
          logger.debug(`abort error ${id}`)
          return
        }
        throw err
      })

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
      let conflictTrIds = conflict.map((i) => inProcess[i].trId)
      let trId = inProcess[id].trId
      let finishingTrIds = conflict.filter((i) => finishing[i]).map((i) => inProcess[i].trId)
      if (!conflict.isEmpty()) {
        if (u.any(conflict, (i) => finishing[i]) ||
            conflictTrIds.min() < trId) {
          logger.debug(`aborting ${trId}, because of ${conflictTrIds}, finishing: ${finishingTrIds}`)
          abortAndReschedule(id)
        } else {
          logger.debug(`aborting ${conflictTrIds}, because of ${trId}, finishing: ${finishingTrIds}`)
          conflict.forEach(abortAndReschedule)
        }
      }
      checkAbort()
    }

    // TODO if possible, make DB operations accept also firebase ref
    function userRead(path) {
      if (u.any(path, (e) => (e == null))) throw new Error(`READ ERROR: undefined / null present in path: ${path}`)
      handlePossibleConflict(registry.conflictingWithRead(path))
      registry.addRead(id, path)
      return Promise.resolve()
        .then(() => read(refFromPath(path)))
        .then((val) => {
          checkAbort()
          return registry.readAsIfTrx(id, path, val)
        })
    }

    function userSet(path, value) {
      handlePossibleConflict(registry.conflictingWithWrite(path))
      registry.addWrite(id, path, value)
    }

    function userAbort(msg) {
      trData.abortMsg = msg
      throw new UserAbort(msg)
    }

    //function update() {
    //}

  }

  function tryConsumeWaiting() {
    while (waiting.length > 0 && trCount < trCountLimit) {
      trCount += 1
      let trData = waiting.shift()
      processTr(nextRunId++, trData)
        .then(() => {
          trCount -= 1
          tryConsumeWaiting()
        })
    }
  }

  let transactionRef = firebase.child('transaction')
  let onChildAdded = transactionRef.on('child_added', (childSnapshot, prevChildKey) => {
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

  return {
    'stop': () => transactionRef.off('child_added', onChildAdded),
    'registry': registry
  }

}

// Asynchronous variant of 'transaction-apply' phase. Sadly, because bug in Firebase
// (or maybe just lack of guarantees provided by Firebase? It's hard to say, the spec
// is fuzzy), this leads to errors (transaction behavior is not guaranteed)
//
//logTrSummary(id, 'process')
//delete inProcess[id]
//set(writesRef, writes)
//writes.forEach((write) => {
//  set(refFromPath(write.get('path')), write.get('value'))
//})
//remove(writesRef)
//set(firebase.child('closed_transactions').child(trData.frbId), trData)
//remove(firebase.child('transaction').child(trData.frbId))
//registry.cleanup(id)

