import {Promise} from 'bluebird'
import {Registry} from './registry'
import {Set} from 'immutable'
import * as u from './useful'
import {read, set, remove} from './firebase_useful'
import log4js from 'log4js'
import {TODO_TRX_PATH, DONE_TRX_PATH} from './settings'

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
    logger.setLevel('INFO')
  }
}

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


export function transactor(firebase, handlers, options = {}) {

  const {
    todoTrxRef = firebase.child(TODO_TRX_PATH),
    closedTrxRef = firebase.child(DONE_TRX_PATH),
    trCountLimit = 50,
    rescheduleDelay = 100
  } = options

  if (!log4js.configured) configureLogging()

  const runs = {} // run id mapped to trData
  const waiting = []
  const trSummary = {aborted: 0, tried: 0, processed: 0}
  const registry = new Registry()
  let nextTrId = 0
  let nextRunId = 0
  let trCount = 0

  function _abort(id) {
    registry.cleanup(id)
    delete runs[id]
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

  function scheduleLater(trData) {
    setTimeout(() => {pushWaiting(trData)}, rescheduleDelay)
  }

  // --abortAndReschedule
  function abortAndReschedule(id) {
    if (runs[id] == null) {
      throw new Error('shouldnt abort transaction that is already aborted')
    }
    logger.debug(`CLEANUP & ABORT : tr no ${id}`)
    trSummary['aborted'] += 1
    scheduleLater(runs[id])
    _abort(id)
  }

  // --processTr
  function processTr(id) {
    logger.debug(`starting process ${id}`)
    const {type, data} = runs[id]
    const handler = handlers[type]
    if (handler == null) {
      throw new Error(`handler for type ${type} does not exist. Full trData: ${runs[id]}`)
    }

    if (runs[id] == null) {
      throw new Error('given run does not exist!')
    }

    return Promise.resolve()
      .then(() => {
        logger.debug(`starting handler ${id}`)
        trSummary['tried'] += 1
        return handler({
          abort: userAbort,
          change: userChange,
          getId: userGetId,
          push: userPush,
          read: userRead,
          set: userSet,
          update: userUpdate,
        }, data)
      })
      .catch((err) => {
        if (err instanceof UserAbort) {
          logger.debug(`user abort ${id}, msg: ${err.msg}`)
          return {error: err.msg}
        }
        throw err
      })
      .then((result) => {
        // even if no Error is thrown, the transaction might be aborted in the
        // very last moment. Better check for it (userabort is not relevant now, as
        // we want to process such transaction)
        if (runs[id] != null) {
          logger.debug(`FINISH: tr no ${id}`)
          let userAborted = runs[id].status === 'useraborted'
          let writes = userAborted ? [] : registry.writesByTrx.get(id, [])
          let writesRef = firebase.child('__internal/writes').child(id)
          trSummary['processed'] += 1
          runs[id].status = 'finishing'
          set(writesRef, writes)
          writes.forEach((write) => {
            // TODO immutable destructuring
            set(refFromPath(write.get('path')), write.get('value'))
          })
          let trData = runs[id]
          remove(writesRef)
          try {
            // TODO handle this better (some parts of result might get lost
            // here, so warn user about it)
            result = JSON.parse(JSON.stringify({result}))
          } catch (e) {
            let msg = `Error for transaction id=${id}, result cannot be saved\n to firebase (result=${result})`
            throw new Error(msg)
          }
          set(closedTrxRef.child(trData.frbId), {data: trData, ...result})
          remove(todoTrxRef.child(trData.frbId))
          registry.cleanup(id)
          delete runs[id]
        }
      })
      .catch((err) => {
        if (err instanceof AbortError) {
          logger.debug(`abort error ${id}`)
          return
        }
        throw err
      })

    function checkAbort() {
      if (runs[id] == null || runs[id].status === 'useraborted') {
        logger.debug('checkAbort: throwing abort')
        throw new AbortError('Transaction was aborted')
      }
      if (runs[id] === 'useraborted') {
        logger.debug('checkAbort: throwing useraborted')
        throw new AbortError('Transaction was aborted')
      }

    }

    function handlePossibleConflict(_conflict) {
      if (_conflict.constructor !== Set) {
        throw new Error('conflict must be of a type immutable.Set')
      }
      checkAbort()
      let conflict = _conflict.delete(id)
      let conflictTrIds = conflict.map((i) => runs[i].trId)
      let trId = runs[id].trId
      let finishingTrIds = conflict.filter((i) => runs[i].status === 'finishing').map((i) => runs[i].trId)
      if (!conflict.isEmpty()) {
        if (u.any(conflict, (i) => runs[i].status === 'finishing') ||
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

    function normalizePath(path) {
      if (u.isImmutable(path)) path = path.toJS()
      if (u.isArray(path)) return path
      throw new Error(`path must be an array or immutable list; got ${path} instead`)
    }

    // TODO if possible, make DB operations accept also firebase ref
    function userRead(path) {
      path = normalizePath(path)
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
      path = normalizePath(path)
      handlePossibleConflict(registry.conflictingWithWrite(path))
      registry.addWrite(id, path, value)
    }

    function userAbort(msg) {
      checkAbort()
      runs[id].abortMsg = msg
      runs[id].status = 'useraborted'
      throw new UserAbort(msg)
    }

    function userPush(path, value) {
      path = normalizePath(path)
      let ref = refFromPath(path).push()
      userSet([...path, ref.key()], value)
      return ref
    }

    function userGetId() {
      return firebase.push().key()
    }

    function userUpdate(path, values) {
      path = normalizePath(path)
      if ((values == null) || (values.constructor !== Object)) {
        throw new Error(`The value argument in update must be a JS Object, found ${values}`)
      }
      Object.keys(values).forEach((key) => userSet([...path, key], values[key]))
    }

    function userChange(path, fn) {
      path = normalizePath(path)
      if (typeof fn !== 'function') {
        throw new Error(`fn argument must be a function, got ${fn} instead`)
      }
      return userRead(path)
        .then((val) => fn(val))
        .then((res) => userSet(path, res))
    }
  }

  function tryConsumeWaiting() {
    while (waiting.length > 0 && trCount < trCountLimit) {
      trCount += 1
      let trData = waiting.shift()
      let id = nextRunId++
      runs[id] = {...trData, status: 'inprocess', id}
      processTr(id)
        .then(() => {
          trCount -= 1
          tryConsumeWaiting()
        })
    }
  }

  let onChildAdded = todoTrxRef.on('child_added', (childSnapshot, prevChildKey) => {
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
    'stop': () => todoTrxRef.off('child_added', onChildAdded),
    'registry': registry,
    'trSummary': trSummary,
  }

}

// Synchronous variant of finishing transaction code
//let toWait = []
//toWait.push(set(writesRef, writes))
//writes.forEach((write) => {
//  // TODO immutable destructuring
//  toWait.push(set(refFromPath(write.get('path')), write.get('value')))
//})
//let trData = runs[id]
//  Promise.all(toWait).then((_) => {
//  remove(writesRef)
//  set(firebase.child(DONE_TRX_PATH).child(trData.frbId), trData)
//  remove(firebase.child(TODO_TRX_PATH).child(trData.frbId))
//  registry.cleanup(id)
//  delete runs[id]
//})
