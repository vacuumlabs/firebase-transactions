import {Promise} from 'bluebird'
import {Registry} from './registry'
//import * as useful from './useful'
import * as fba from './firebase_actions'

// when aborted transaction should be rescheduled; in milliseconds
const rescheduleDelay = 100

class AbortError {
  constructor(msg) {
    this.msg = msg
  }
}

export function transactor(firebase, handlers) {

  const registry = new Registry()

  function refFromPath(path) {
    return firebase.child(path.join('/'))
  }

  function process(trData) {
    const {type, id, data} = trData
    const handler = handlers[type]
    if (handler == null) {
      throw new Error(`handler for type ${type} does not exist. Full trData: ${trData}`)
    }

    function abort(id) {
      registry.cleanup(id)
      // if tansaction is aborted, re-schedule it after some delay
      setTimeout(() => {pushWaiting(trData)}, rescheduleDelay)
      console.log(`ABORT: tr no ${trData.id}`)
      throw new AbortError('Transaction was aborted')
    }

    function checkAbort() {
      if (!registry.isInProgress(id)) {
        throw new AbortError('Transaction was aborted')
      }
    }

    function handlePossibleConflict(conflict) {
      if (!conflict.isEmpty()) {
        if (conflict.min() === id) {
          for (let trId of conflict) {
            if (trId !== id) {
              abort(trId)
            }
          }
        } else {
          abort(id)
        }
      }
    }

    // TODO extract path from firebase ref ?
    function read(path) {
      return Promise.resolve()
        .then(() => {
          checkAbort()
          return fba.read(refFromPath(path)).then((val) => {
            handlePossibleConflict(registry.conflictingWithRead(path))
            return registry.readAsIfTrx(id, path, val)
          })
        })
    }

    function set(path, value) {
      checkAbort()
      handlePossibleConflict(registry.conflictingWithRead(path))
      registry.addWrite(id, path, value)
    }

    registry.open(id)
    return Promise.resolve()
      .then(() => {
        return handler({set, read}, data)
      })
      .then(() => {
        let writes = registry.writesByTrx.get(id)
        writes.forEach((write) => {
          // TODO immutable destructuring
          fba.set(refFromPath(write.get('path')), write.get('value'))
        })
        //console.log('writes', writes)
        registry.cleanup(id)
      })
      .catch((err) => {
        if (err instanceof AbortError) {
          return
        }
        throw err
      })

  }

  let nextId = 0
  const trCountLimit = 30
  let trCount = 0

  const waiting = []

  function pushWaiting(val) {
    waiting.push(val)
    tryConsumeWaiting()
  }

  function tryConsumeWaiting() {
    while (waiting.length > 0 && trCount < trCountLimit) {
      trCount += 1
      let trData = waiting.shift()
      process(trData)
        .then(() => { //eslint-disable-line no-loop-func
          console.log(`FINISH: tr no ${trData.id}`)
          trCount -= 1
          tryConsumeWaiting()
        })
        //.catch((err) => console.log('tutututu', err, (err instanceof AbortError)))
    }
  }

  firebase.child('transaction').on('child_added', (childSnapshot, prevChildKey) => {
    let trData = childSnapshot.val()
    if (trData.type == null) {
      console.log('malformed data: ', trData)
      throw new Error('malformed trData')
    }
    console.log(`SCHEDULED: tr no ${nextId}`)
    trData.id = nextId++
    pushWaiting(trData)
  })

}
