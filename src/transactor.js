import {read, set} from 'firebase_actions'
export function transactor(firebase, transactionConfig) {

  function push() {}

  let eventCount = 0

  let startProcess = () => {
    if (eventCount === 0) return null
    return processOne().then(() => {
      eventCount--
      startProcess()
    })
  }

  firebase.child('transaction').on('value', (snapshot) => {
    eventCount++
    if (eventCount === 1) startProcess()
  })

  function processOne() {
    firstTransaction()
    .then(({id, data}) => {
      let fn = transactionConfig[data.type]
      return fn({read, set, push}, data)
        .then(() => {
          firebase.child('finished_transaction').child(id).set(data)
          firebase.child('transaction').get(id).remove()
        })
    })
  }

  function firstTransaction() {
    return read(firebase.child('transaction').orderByKey.limitToFirst(1))
      .then((data) => {
        if (data == null) return null
        const id = Object.keys(data)[0]
        const transactionData = data[id]
        return {id, transactionData}
      }).catch((e) => console.error(e.stack)) // eslint-disable-line no-console
  }

}

