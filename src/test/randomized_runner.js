import {expect} from 'chai'
import log4js from 'log4js'
import {test as testBasic} from './randomized_basic'
import {test as testComplex} from './randomized_complex'
//import * as u from '../useful'

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
logger.setLevel('WARN')
// use this setting to indicate that logging was already set and
// individual components shouldn't use their defaults
log4js.configured = true

describe('randomized', function() {

  this.timeout(60 * 60 * 1000)

  const settingses = []
  const _settingses = [
    {userCount: 20, maxTrCredit: 100, trCount: 20},
    {userCount: 20, maxTrCredit: 200, trCount: 20},
    {userCount: 100, maxTrCredit: 100, trCount: 500},
    {userCount: 100, maxTrCredit: 200, trCount: 500},
  ]

  const maxWaits = [10, 20, 50]

  for (let settings of _settingses) {
    for (let maxWait of maxWaits) {
      settingses.push({...settings, maxWait, baseCredit: 100})
    }
  }


  for (let settings of settingses) {
    it(`running_complex ${JSON.stringify(settings)}`, () => {
      return testComplex(settings)
        .then(({sumCredit, minCredit, trSummary}) => {
          expect(sumCredit).to.equal(27 * settings.baseCredit * settings.userCount)
          expect(minCredit).to.be.at.least(0)
          expect(trSummary.processed).to.equal(settings.trCount)
        })
    })
    it(`running_basics ${JSON.stringify(settings)}`, () => {
      return testBasic(settings)
        .then(({sumCredit, minCredit, trSummary}) => {
          expect(sumCredit).to.equal(settings.baseCredit * settings.userCount)
          expect(minCredit).to.be.at.least(0)
          expect(trSummary.processed).to.equal(settings.trCount)
        })
    })
  }
})
