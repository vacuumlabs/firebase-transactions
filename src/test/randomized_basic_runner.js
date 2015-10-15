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
logger.setLevel('WARN')
// use this setting to indicate that logging was already set and
// individual components shouldn't use their defaults
log4js.configured = true

describe('randomized', function() {

  this.timeout(60 * 60 * 1000)

  const settingses = []
  //const handlers = ['pay', 'payDeep']
  const handlers = ['pay', 'payDeep', 'payValidated', 'payDeepValidated']

  for (let userCount of [10, 20, 50, 100]) {
    for (let maxWait of [10, 20, 50, 100]) {
      for (let trCount of [20, 50]) {
        settingses.push({userCount, maxWait, trCount, baseCredit: 100, handlerNames: handlers})
      }
    }
  }

  for (let settings of settingses) {
    it(`running ${JSON.stringify(settings)}`, () => {
      return test(settings)
        .then(({sumCredit, sumTrCount, trSummary}) => {
          expect(sumCredit).to.equal(settings.baseCredit * settings.userCount)
          //expect(sumTrCount).to.equal(2 * settings.trCount)
        })
    })
  }
})
