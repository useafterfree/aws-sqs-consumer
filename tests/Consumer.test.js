import test from 'ava'
import Consumer from './../src/Consumer'
import Promise from 'bluebird'
import chance from 'chance'

let consumer = null
const Chance = new chance()

require('dotenv').config({ path: './../.env' })

test.skip('cleanup', () => {
  return consumer.sqs.purgeQueue({ QueueUrl: process.env.SQS_ENDPOINT }).promise()
})

test.skip('constructor of consumer', () => {
  consumer = new Consumer({
    queueUrl: process.env.SQS_ENDPOINT,
    handleMessage: (message) => {}
  })

  const messages = Array(100)

  return Promise.map(messages, () => {
      return consumer.sqs.sendMessage({
        MessageBody: Chance.sentence(),
        QueueUrl: process.env.SQS_ENDPOINT
      }).promise()
    })
})

// test('test processing of message', t => {
//   consumer.handleMessage = (message) => {
//     console.log(message.Body)
//     t.true(message.Body.length > 0)
//   }
//
//   consumer.on('empty', () => t.pass())
// })
