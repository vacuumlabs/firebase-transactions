import {expect} from 'chai'
import log4js from 'log4js'
import {test} from './randomized_basics'
import * as u from '../useful'

log4js.configure({
  appenders: [{
    type: 'console',
    layout: {
      type: 'pattern',
      pattern: '[%[%5.5p%]] - %m'
    }
  }]
})

const logger = log4js.getLogger('transactor')
logger.setLevel('DEBUG')
// use this setting to indicate that logging was already set and
// individual components shouldn't use their defaults
log4js.configured = true

function repeatAsync(n, f) {
  let res = Promise.resolve()
  u.repeat(n, (i) => {
    res = res.then((_) => f(i))
  })
  return res
}


describe('randomized', function() {

  this.timeout(60 * 60 * 1000)

  it('basics', () => {
    const settings = {trCount: 100, baseCredit: 1000, userCount: 100, maxWait: 100}

    return repeatAsync(100, () =>
      test(settings)
        .then(({sumCredit, sumTrCount, trSummary}) => {
          //console.log('trSummary', trSummary)
          console.log('sumCredit', sumCredit)
          console.log('sumTrCount', sumTrCount / 2)
          expect(sumCredit).to.equal(settings.baseCredit * settings.userCount)
          expect(sumTrCount).to.equal(2 * settings.trCount)
        })
    )
  })
})
