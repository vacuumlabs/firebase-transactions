#Documentation
## Client

#### getClient(firebase, options = {})

Constructs client that is used for submitting queries

&nbsp;&nbsp;**args:**<br />
&nbsp;&nbsp;&nbsp;&nbsp;*firebase:* firebase ref<br />
&nbsp;&nbsp;&nbsp;&nbsp;options (optional):<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*todoTrxRef:* where to put to-be-processed transactions<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*doneTrxRef:* where finished tansactions are expected to be put<br />

&nbsp;&nbsp;**returns:**<br />
&nbsp;&nbsp;&nbsp;&nbsp;*submitTransaction* function<br />

#### submitTransaction(type, data)
&nbsp;&nbsp;**args:**<br />
&nbsp;&nbsp;&nbsp;&nbsp;*type:* string, matches with handler type<br />
&nbsp;&nbsp;&nbsp;&nbsp;*data:* any firebase-serializable JS object describing the transaction<br />
## Server

#### transactor(firebase, handlers, options = {})

Starts transactor.

&nbsp;&nbsp;**args:**<br />
&nbsp;&nbsp;&nbsp;&nbsp;*firebase:* firebase ref<br />
&nbsp;&nbsp;&nbsp;&nbsp;*handlers:* {String type: transaction_handler} map<br />
&nbsp;&nbsp;&nbsp;&nbsp;*options:*<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*todoTrxRef:* Firebase ref, where new transactions appear in Firebase<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*closedTrxRef:* Firebase ref, where finished transactions are put<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*internalRef:* Firebase ref, Transactor put pending writes here<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*trCountLimit:* int, concurency ammount; how many transactions should be processed at once<br />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;*rescheduleDelay:* int, how long to wait (in ms) before re-scheduling aborted transaction<br />

&nbsp;&nbsp;**returns:** handler = {stop, trSummary (for debug & test purposes)},<br />

#### stop()

Stops transactor

#### transaction_handler({abort, change, push, read, set, update}, data)

User defined function, transaction handler associated to certain transaction type.

First argument are custom firebase-access functions that you can use to manipulate DB, the second argument is
'data' which corresponds to submitTransaction's 'data'. Author of transaction_handler must
return Promise that fulfills when the transaction is finished. If the Promise got rejected, the
transaction gets to the similar state as if it was aborted by user by calling 'abort'; the
Promise returned by submitTransaction will fulfill with {error: message}

Most of Firebase-accessors functions accept keypath argument. Unlike Firebase reference, this is
specified as a simple array of keys, i.e. ['user', 123, 'name'] may represent path to users name.

#### read(keypath)
Reads the value.
&nbsp;&nbsp;**returns:** Promise(value_read)<br />

#### set(keypath, val)
Sets the value. This is synchronous process; transactor just remembers the write that should
happen. Returns nothing.

#### push(keypath, val)
Analogous to Firebase's push

#### change(keypath, fn)
Read the value from given location, then set this location to fn(value)

#### update(keypath, obj)
Update the location's value with all k,v pair present in object obj. Since this is just a bunch
of sets, it's also synchronous operation.

#### abort(msg)
Aborts the transaction. None modification done will be saved to the DB, the transaction will be
understood as finished and the transactor won't try to repeat it. The Promise returned by
submitTransaction() call (on client side) will fulfill with {userError: msg}
Argument 'msg' is any object serializable by Firebase (ususally the simple String)

#### getId()
Convenience function, returns unique Firebase ID.
