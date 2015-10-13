import {Scheduler} from './scheduler'

export class FirebaseScheduler {
  construct(firebase, capacity = 100) {
    this.firebase = firebase
    this.capacity = capacity
    let scheduler = Scheduler()
    this.scheduler = scheduler
    this.getOne = scheduler.getOne
    this.schedule = scheduler.schedule
    this.size = scheduler.size
  }

  run() {
    this.firebase.on('child_added', (childSnapshot, prevChildKey) => {
      if (this.size() < this.capacity) {
        this.schedule(createTransaction(childSnapshot))
      }
    })
  }
}
