import Heap from 'heap'
import {Promise} from 'bluebird'

export class Scheduler {
  constructor() {
    this.scheduled = new Heap((trx) => trx.time)
    this.pending = null
    this.last = Promise.resolve(null)
  }

  getOne() {
    this.last = this.last.then(() => {
      const res = new Promise((resolve, reject) => {
        this.pending = {resolve, reject}
      })
      this.check()
      return res
    })
    return this.last
  }

  check() {
    if (this.scheduled.size() > 0) {
      if (this.scheduled.peek().completed) {
        if (this.pending != null) {
          this.pending.resolve(this.scheduled.pop().val)
          this.pending = null
        }
      }
    }
  }

  schedule(val, time) {
    const item = {val, time, completed: false}
    this.scheduled.push(item)
    Promise.delay(time).then(() => {
      item.completed = true
      this.check()
    })
  }

  size() {
    return this.scheduled.size()
  }
}
