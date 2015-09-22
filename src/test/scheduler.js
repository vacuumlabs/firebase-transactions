import {expect} from 'chai'
import {Scheduler} from '../scheduler'
import {Promise} from 'bluebird'


describe('scheduler', () => {

  let s, expectTime, beginTime

  beforeEach(function() {
    s = new Scheduler()
    beginTime = Date.now()
    expectTime = (value) => {
      expect(Math.abs((Date.now() - beginTime) - value)).to.be.below(10)
    }
  })

  it('delays', () => {
    s.schedule('a', 100)
    return s.getOne().then((val) => {
      expect(val).to.equal('a')
      expectTime(100)
    })
  })

  it('ask, schedule, ask, schedule', () => {
    s.schedule('a', 100)
    s.schedule('b', 200)
    return Promise.all([
      Promise.delay(50).then(() => {
        return s.getOne().then((val) => {
          expect(val).to.equal('a')
          expectTime(100)
        })
      }),
      Promise.delay(150).then(() => {
        return s.getOne().then((val) => {
          expect(val).to.equal('b')
          expectTime(200)
        })
      })])
  })

  it('ask, ask, schedule, schedule', () => {
    s.schedule('a', 100)
    s.schedule('b', 200)
    let a = s.getOne()
    let b = s.getOne()
    return Promise.all([
      a.then((val) => {
        expect(val).to.equal('a')
        expectTime(100)
      }),
      b.then((val) => {
        expect(val).to.equal('b')
        expectTime(200)
      }),
    ])
  })

  it('schedule, schedule, ask, ask', () => {
    s.schedule('a', 50)
    s.schedule('b', 100)
    return Promise.delay(150).then(() => {
      return Promise.all([
        s.getOne().then((val) => {expect(val).to.equal('a')}),
        s.getOne().then((val) => {expect(val).to.equal('b')}),
      ])
    })
  })

  it('schedule, ask, schedule-overrun, ask', () => {
    s.schedule('a', 150)
    Promise.delay(80).then(() => {
      s.schedule('b', 40)
    })

    Promise.delay(50).then(() => {
      return Promise.all([
        s.getOne().then((val) => {expect(val).to.equal('b')}),
        s.getOne().then((val) => {expect(val).to.equal('a')}),
      ])
    })
  })

  //for (let i = 0; i < 10000; i++) {
  //  it('should move the cat', () => {})
  //}

  //Promise.delay = (time) => {
  //  return new Promise((resolve, reject) => {
  //    setTimeout(() => resolve(), time)
  //  })
  //}

})
