
import transactor from 'transactor'
import Firebase from 'Firebase'

const firebase = Firebase('https://mytransactionalapp.firebaseio.com/')

var transactorApp = transactor(firebase, {
  'payOrder': (read, write, push) => {},
  'transferMoney': (read, write, push) => {},
})

app.use('/transaction', transactorApp)

