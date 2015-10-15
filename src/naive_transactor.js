import {read, set} from './firebase_actions'
import {TODO_TRX_PATH} from './settings'

export default function transactor(firebase, transactionConfig) {

  function trRead(path) {
    return read(firebase.child(path.join('/')))
  }

  function trSet(path, value) {
    return set(firebase.child(path.join('/')), value)
  }

  function push() {}

  let eventCount = 0

  let startProcess = () => {
    if (eventCount === 0) return null
    return processOne().then(() => {
      eventCount--
      startProcess()
    })
  }

  firebase.child(TODO_TRX_PATH).on('value', (snapshot) => {
    eventCount++
    if (eventCount === 1) startProcess()
  })

  function processOne() {
    return firstTransaction()
    .then(({id, data}) => {
      console.log('got data', data)
      let fn = transactionConfig[data.type]
      return fn({read: trRead, set: trSet, push}, data)
        .then(() => {
          firebase.child('finished_transaction').child(id).set(data)
          firebase.child(TODO_TRX_PATH).child(id).remove()
        })
    })
  }

  function firstTransaction() {
    return read(firebase.child(TODO_TRX_PATH).orderByKey().limitToFirst(1))
      .then((data) => {
        if (data == null) return null
        const id = Object.keys(data)[0]
        const _data = data[id]
        return {id, data: _data}
      }).catch((e) => console.error(e.stack)) // eslint-disable-line no-console
  }

}

