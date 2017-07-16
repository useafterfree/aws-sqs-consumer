import test from 'ava'
import Consumer from './../src/Consumer'

test('constructor of consumer', t => {
  let consumer = new Consumer({
    queueUrl: 'http://that.queueurl.com',
    handleMessage: (message) => {

      // add your custom logic here. Remember, this is promise based!
    }
  })

  t.pass()
})
