import {Promise} from 'bluebird'
import {Registry} from './registry'
import * as u from './useful'
import * as fba from './firebase_actions'

// when aborted transaction should be rescheduled; in milliseconds
const rescheduleDelay = 100

class AbortError {
  constructor(msg) {
    this.msg = msg
  }
}

export const trSummary = {}

export function transactor(firebase, handlers) {

  function logTrSummary(id, op) {
    if (trSummary[id] == null) {
      trSummary[id] = {'try': 0, 'abort': 0, 'process': 0}
    }
    trSummary[id][op]++
  }

  const registry = new Registry()

  function refFromPath(path) {
    return firebase.child(path.join('/'))
  }

  let inProcess = {}
  let nextId = 0
  const trCountLimit = 30
  let trCount = 0

  const waiting = []

  function pushWaiting(val) {
    if (val == null) {
      throw new Error('val should be trx, not null/undefined')
    }
    waiting.push(val)
    tryConsumeWaiting()
  }

  function abort(id) {
    if (inProcess[id] == null) {
      throw new Error('shouldnt abort transaction that is already aborted')
    }

    logTrSummary(id, 'abort')
    registry.cleanup(id)
    // if tansaction is aborted, re-schedule it after some delay
    //console.log('rescheduling', waitingIndex[id])
    let trData = inProcess[id]
    setTimeout(() => {pushWaiting(trData)}, rescheduleDelay)
    delete inProcess[id]
    console.log(`ABORT: tr no ${id}`)
  }

  function process(trData) {
    console.log(`starting process ${trData.id}`)
    const {type, id, data} = trData
    const handler = handlers[type]
    if (handler == null) {
      throw new Error(`handler for type ${type} does not exist. Full trData: ${trData}`)
    }

    function checkAbort() {
      if (inProcess[id] == null) {
        throw new AbortError('Transaction was aborted')
      }
    }

    function handlePossibleConflict(conflict) {
      checkAbort()
      conflict = conflict.delete(id)
      if (!conflict.isEmpty()) {
        if (!u.all(conflict, (i) => (inProcess[i] != null)) ||
            conflict.min() < id) {
          console.log(`aborting ${id}, because of ${conflict}`)
          abort(id)
        } else {
          console.log(`aborting ${conflict}, because of ${id}`)
          conflict.forEach(abort)
        }
      }
      checkAbort()
    }

    // TODO if possible, make DB operations accept also firebase ref
    function read(path) {
      handlePossibleConflict(registry.conflictingWithRead(path))
      return Promise.resolve()
        .then(() => fba.read(refFromPath(path)))
        .then((val) => {
          handlePossibleConflict(registry.conflictingWithRead(path))
          console.log('read', id, path, val)
          registry.addRead(id, path)
          return registry.readAsIfTrx(id, path, val)
        })
    }

    function set(path, value) {
      handlePossibleConflict(registry.conflictingWithWrite(path))
      console.log('write', id, path, value)
      registry.addWrite(id, path, value)
    }

    inProcess[id] = trData
    return Promise.resolve()
      .then(() => {
        //console.log(`starting handler ${id}`)
        logTrSummary(id, 'try')
        return handler({set, read}, data)
      })
      .then(() => {
        checkAbort()
        console.log(`FINISH: tr no ${id}`)
        let writes = registry.writesByTrx.get(id)
        let writesRef = firebase.child('__internal/writes').child(id)

        // @marcelka: mame dve alternativy ako urobit 'apply' fazu

        //// @marcelka: toto je asynchronna alternativa: just fire all and wait
        //// till firebase do good
        //logTrSummary(id, 'process')
        //delete inProcess[id]
        //fba.set(writesRef, writes)
        //writes.forEach((write) => {
        //  // TODO immutable destructuring
        //  fba.set(refFromPath(write.get('path')), write.get('value'))
        //})
        //fba.remove(writesRef)
        //fba.set(firebase.child('closed_transactions').child(trData.frbId), trData)
        //fba.remove(firebase.child('transaction').child(trData.frbId))
        //registry.cleanup(id)


        // @marcelka: toto je synchronna alternativa: pekne na vsetko pockaj
        logTrSummary(id, 'process')
        delete inProcess[id]
        fba.set(writesRef, writes)
        .then(() => Promise.all(Array.from(writes.map((write) =>
          fba.set(refFromPath(write.get('path')), write.get('value'))
        ))))
        .then((_) => {
          fba.remove(writesRef)
          fba.set(firebase.child('closed_transactions').child(trData.frbId), trData)
          fba.remove(firebase.child('transaction').child(trData.frbId))
          registry.cleanup(id)
        })

      })
      .catch((err) => {
        if (err instanceof AbortError) {
          //console.log(`abort error ${id}`)
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
        .then(() => { //eslint-disable-line no-loop-func
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
    console.log(`SCHEDULED: tr no ${nextId} data: ${JSON.stringify(trData)}`)
    trData.id = nextId++
    trData.frbId = childSnapshot.key()
    pushWaiting(trData)
  })

}
