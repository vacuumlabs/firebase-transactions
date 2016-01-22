
This tutorial describes most functionality of Firebase-Transactions. We will create an example: 

- First we generate 100 random users with different credits
- Then we generate 1000 random transactions 
- We start transactor and let those transactions be processed

This is not a real-life example: the main difference is, that in real world, transactions
would be put to Firebase from browser - as a result to some user interaction. However, the example
should give you nice overview of what this small library is capable.

Let's start with some setup:
```javascript
import Firebase from 'firebase'
import {getClient} from '../firebase-transactions'
import {transactor} from  '../firebase-transactions'
import {firebaseUseful} from  '../firebase-transactions'

// promisified Firebase.set
const {set} = firebaseUseful
const firebaseUrl = 'https://gugugu.firebaseio.com'
const firebaseGlobal = new Firebase(firebaseUrl)
const firebase = firebaseGlobal.child(`tutorial ${new Date()}`)

function randRange(from, to) {
  return from + Math.floor(Math.random() * (to - from))
}

const userCount = 100
const trCount = 1000
```

Don't forget to change the Firebase URL to your Firebase instance. Although you can run the tutorial
with this Firebase instance, you won't be able to inspect the DB in the admin interface.

First, let's start with randomly populating db, this is pretty straightforward.
```javascript
let toWait = []
set(firebase, null)
// to avoid annoying flickering of firebase in-browser explorer,
// keep at least one record in the collection
toWait.push(set(firebase.child('__internal/fbkeep'), 'fbkeep'))
const userRef = firebase.child('user')
const usersIds = []
for (let i = 0; i < userCount; i++) {
  usersIds.push(i)
  let user = {name: `Johny${i}`, credit: 100}
  set(userRef.child(i), user)
}
```

Now we create a handler for the 'pay' transaction.
```javascript
const pay = ({read, set, push, abort, change}, data) => {
  return change(['user', data.userFrom, 'credit'], (c) => c - data.credit)
  .then(() => change(['user', data.userTo, 'credit'], (c) => c + data.credit))
  .then(() => read(['user', data.userFrom, 'credit']))
  .then((credit) => {
    if (credit < 0) {
      abort('not enough funds')
    }
  })
}
```
few things to note here:
- handler's first argument is object containing various firebase read / write functions. Their exact
  description can be found in documentation. Only 'change' and 'read' functions are used by this
  handler.
- All read / set operations work in 'sandboxed' environment; most notably, the effect of write
  operations will be present only after the transaction is comitted.
- after the funds are transferred, we read once again sender's account, check whether the ballance is not negative, and abort
  the transaction if needed. This is not very straight-forward - credit check could be part of
  change() call; however, we did it this way 'because we can' - to illustrate the power of the lib.

Before we submit actual transactions, we must create a client first. Client purpose is just to
allow us to submit transactions. Therefore, client is not an object but rather a simple function.
```javascript
const submitTrx = getClient(firebase)
```

Once we have client, we can use it to submit the transactions:
```javascript
function getRandomPayTransaction() {
  const userFrom = randRange(0, userCount)
  // userTo will be different from userTo
  const userTo = (userFrom + randRange(0, userCount - 1)) % userCount
  const credit = randRange(0, 100)
  return {userFrom, userTo, credit}
}

for (let i = 0; i < trCount; i++) {
  submitTrx('pay', getRandomPayTransaction(usersIds))
}
```

finally, we can start the transactor:
```javascript
transactor(firebase, {pay})
```

Open the Firebase admin console and watch, as the users' accounts gets updated and transaction
descriptors are moved to 'closed_transaction'


