import {Promise} from 'bluebird'
import {Registry} from './registry'
import {Set} from 'immutable'
import * as u from './useful'
import {read, set, remove, push} from './firebase_useful'
import log4js from 'log4js'
import {TODO_TRX_PATH, DONE_TRX_PATH, INTERNAL_TRX_PATH} from './settings'

let logger = log4js.getLogger('transactor')

// if the logging is not configured, use densible default
// whether logging was configured or not is determined
// by log4js.configured singleton
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


/***
 * ## Server
 *
 * #### transactor(firebase, handlers, options = {})
 *
 *   Starts transactor.
 *
 *     args:
 *       firebase: firebase ref
 *       handlers: {String type: transaction_handler} map
 *       options:
 *         todoTrxRef: Firebase ref, where new transactions appear in Firebase
 *         closedTrxRef: Firebase ref, where finished transactions are put
 *         internalRef: Firebase ref, Transactor put pending writes here
 *         trCountLimit: int, concurency ammount; how many transactions should be processed at once
 *         rescheduleDelay: int, how long to wait (in ms) before re-scheduling aborted transaction
 *
 *     returns: handler = {stop, trSummary (for debug & test purposes)},
 *
 * #### stop()
 *
 *   Stops transactor
 *
 * #### transaction_handler({abort, change, push, read, set, update}, data)
 *
 *   User defined function, transaction handler associated to certain transaction type.
 *
 *   First argument are custom firebase-access functions that you can use to manipulate DB, the second argument is
 *   'data' which corresponds to submitTransaction's 'data'. Author of transaction_handler must
 *   return Promise that fulfills when the transaction is finished. If the Promise got rejected, the
 *   transaction gets to the similar state as if it was aborted by user by calling 'abort'; the
 *   Promise returned by submitTransaction will fulfill with {error: message}
 *
 * Most of Firebase-accessors functions accept keypath argument. Unlike Firebase reference, this is
 * specified as a simple array of keys, i.e. ['user', 123, 'name'] may represent path to users name.
 *
 * #### read(keypath)
 *   Reads the value.
 *     returns: Promise(value_read)
 *
 * #### set(keypath, val)
 *   Sets the value. This is synchronous process; transactor just remembers the write that should
 *   happen. Returns nothing.
 *
 * #### push(keypath, val)
 *   Analogous to Firebase's push
 *
 * #### change(keypath, fn)
 *   Read the value from given location, then set this location to fn(value)
 *
 * #### update(keypath, obj)
 *   Update the location's value with all k,v pair present in object obj. Since this is just a bunch
 *   of sets, it's also synchronous operation.
 *
 * #### abort(msg)
 * Aborts the transaction. None modification done will be saved to the DB, the transaction will be
 * understood as finished and the transactor won't try to repeat it. The Promise returned by
 * submitTransaction() call (on client side) will fulfill with {userError: msg}
 * Argument 'msg' is any object serializable by Firebase (ususally the simple String)
 *
 * #### getId()
 *   Convenience function, returns unique Firebase ID.
 *
 ***/
export function transactor(firebase, handlers, options = {}) {

  const {
    todoTrxRef = firebase.child(TODO_TRX_PATH),
    closedTrxRef = firebase.child(DONE_TRX_PATH),
    internalRef = firebase.child(INTERNAL_TRX_PATH),
    internalWritesRef = internalRef.child('writes'),
    trCountLimit = 50,
    rescheduleDelay = 100
  } = options

  if (!log4js.configured) configureLogging()
  if (options.logger) {
    logger = options.logger
  }

  const runs = {} // run id mapped to trData
  const prohibited = {}
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
      .then((result) => {
        prohibited[id] = true
        setTimeout(() => {delete prohibited[id]}, 30000)
        return result
      })
      .catch((err) => {
        prohibited[id] = true
        if (!(err instanceof AbortError)) {
          if (err instanceof UserAbort) {
            logger.debug(`user abort ${id}, msg: ${err.msg}`)
            return {userError: err.msg}
          } else {
            if (!process.env.supressErrors) {
              logger.error(`Unknown error abort ${err} ${err.stack}`)
              console.error(err)
              console.error(err.stack)
            }
            return {error: `${err}`}
          }
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
          let writesRef = push(internalWritesRef, {})
          trSummary['processed'] += 1
          runs[id].status = 'finishing'
          set(writesRef, writes)
          writes.forEach((write) => {
            // TODO immutable destructuring
            set(refFromPath(write.get('path')), write.get('value'))
          })
          let trData = runs[id]
          remove(writesRef)
          // {result: undefined} cannot be put into Firebase. OTOH, {result: null} is ok.
          if (result === undefined) {
            result = null
          }
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
      if (prohibited[id]) {
        logger.warn('Unchained promise; you probably forgot to chain the promises in your transaction correctly.')
      }
      if (runs[id] == null || runs[id].status === 'useraborted') {
        logger.debug('checkAbort: throwing abort')
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

    function userGetId() {
      return firebase.push().key()
    }
  } // end processTr

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

  const canStart = read(internalWritesRef)
  .then((writesl2) => {
    const waitForWrites = []
    writesl2 = writesl2 || {}
    u.forEachKV(writesl2, (_, writesl1) => {
      for (let write of writesl1) {
        waitForWrites.push(set(refFromPath(write.path), write.value))
      }
    })
    waitForWrites.push(set(internalWritesRef, null))
    let msg = Object.keys(writesl2).length === 0 ?
      'Clean start: no pending writes from previous session'
        :
      'Succesfully applied pending writes from the last session'
    return Promise.all(waitForWrites)
      .then(() => logger.info(msg))
  })


  // run transactor, remember the firebase-listening reference
  let onChildAdded
  canStart.then(() => {
    onChildAdded = todoTrxRef.on('child_added', (childSnapshot, prevChildKey) => {
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
  })

  // --end-transactor
  return {
    'stop': () => canStart.then((_) => todoTrxRef.off('child_added', onChildAdded)),
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
