import {test} from './test/randomized_basic'

test({trCount: 100, baseCredit: 100, maxTrCredit: 100, userCount: 200, maxWait: 0})
.then((res) => {
  console.log(res)
})
.then(() => process.exit())
