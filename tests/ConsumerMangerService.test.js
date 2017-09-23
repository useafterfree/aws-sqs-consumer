import test from 'ava'
import ConsumerManagerService from './../src/ConsumerManagerService'

test.skip('constructor of consumer manager service', t => {
  let manager = new ConsumerManagerService({
    queueUrl: process.env.SQS_ENDPOINT,
    handleMessage: (message) => {
      console.log(message)

      return Promise.resolve(t.pass())
    }
  })

  t.pass()
})
