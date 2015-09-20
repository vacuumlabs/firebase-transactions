import Heap from 'heap'

export class Scheduler {
  construct() {
    this.scheduled = new Heap((trx) => trx.time)
    this.notify = null
  }

  getOne() {
    let promises = [
      new Promise((resolve, reject) => {
        this.notify = () => this.getOne().then(resolve)
      })
    ]

    if (this.scheduled.size() > 0) {
      let now = new Date().getTime()
      let time = this.scheduled.peek().time
      promises.push(
        new Promise((resolve, reject) => {
          if (time <= now) {
            this.notify = null
            resolve(this.scheduled.pop().fn)
          } else {
            setTimeout(() => this.getOne().then(resolve), time - now)
          }
        })
      )
    }

    return Promise.race(promises)
  }

  schedule(fn, time) {
    this.scheduled.push({fn, time})
    if (this.notify != null) this.notify()
  }

  size() {
    return this.scheduled.size()
  }
}
