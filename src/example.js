import {test} from './test/randomized_complex'

test({trCount: 100, baseCredit: 100, maxTrCredit: 100, userCount: 20, maxWait: 0})
.then((res) => {
  console.log(res)
})
.then(() => process.exit())
