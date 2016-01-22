import Firebase from 'firebase'
import {expect} from 'chai'
import log4js from 'log4js'
import {runSandboxed} from '../lib/firebase_useful'
import {test as testBasic} from './randomized_basic'
import {test as testComplex} from './randomized_complex'
import {firebaseUrl} from '../lib/settings'
//import * as u from '../useful'

const globalFirebase = new Firebase(firebaseUrl)

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
      return runSandboxed(globalFirebase, (firebase) => {
        return testComplex(firebase, settings)
          .then(({sumCredit, minCredit, trSummary}) => {
            expect(sumCredit).to.equal(27 * settings.baseCredit * settings.userCount)
            expect(minCredit).to.be.at.least(0)
            expect(trSummary.processed).to.equal(settings.trCount)
          })
      }, {prefix: 'automated-test'})
    })
    it(`running_basics ${JSON.stringify(settings)}`, () => {
      return runSandboxed(globalFirebase, (firebase) => {
        return testBasic(firebase, settings)
          .then(({sumCredit, minCredit, trSummary}) => {
            expect(sumCredit).to.equal(settings.baseCredit * settings.userCount)
            expect(minCredit).to.be.at.least(0)
            expect(trSummary.processed).to.equal(settings.trCount)
          })
      }, {prefix: 'automated-test'})
    })
  }

})
