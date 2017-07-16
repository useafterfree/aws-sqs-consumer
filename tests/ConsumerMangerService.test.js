import test from 'ava'
import ConsumerManagerService from './../src/ConsumerManagerService'

test('constructor of consumer manager service', t => {

  let util = require('util')
  console.log(util.inspect(ConsumerManagerService, false, null))

  let manager = new ConsumerManagerService({
    queueUrl: 'http://that.queueurl.com',
    handleMessage: (message) => {

      // add your custom logic here. Remember, this is promise based!
    }
  })

  t.pass()
})
