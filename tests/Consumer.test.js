'use strict'

const test = require('ava')
const {Consumer} = require('./../src/')
const Promise = require('bluebird')
const Chance = require('chance')
const {chunk} = require('lodash')
const messagePlan = 50

require('dotenv').config({path: `${__dirname}/../.env`})

const generator = new Chance()
const consumer = new Consumer({
  queueUrl: process.env.SQS_ENDPOINT,
  handleMessage: (message) => {},
  events: {
    error: (error) => console.log(error)
  }
})

test.before('cleanup', () => {
  return consumer.sqs.purgeQueue({QueueUrl: process.env.SQS_ENDPOINT}).promise()
    .catch(error => console.log(error.message))
})

test.cb('constructor of consumer', t => {
  t.plan(messagePlan)

  consumer.consumerDefaults.handleMessage = (message) => {
    t.true(message.Body.length > 0)
    return Promise.resolve(true)
  }

  const messages = []

  for (var i = 0; i < messagePlan; i++) {
    messages.push({
      Id: generator.guid(),
      MessageBody: generator.sentence()
    })
  }

  const chunked = chunk(messages, 10)

  Promise.map(chunked, async (block) => {
    await consumer.sqs.sendMessageBatch({
      Entries: block,
      QueueUrl: consumer.consumerDefaults.queueUrl
    }).promise().catch(error => console.log(error.message))
  })
    .then(() => {
      setTimeout(() => {
        consumer.consumerDefaults.events.empty = () => {
          t.end()
        }
      }, 1000)
    })
})

test.after('cleanup', () => {
  return consumer.sqs.purgeQueue({QueueUrl: process.env.SQS_ENDPOINT}).promise()
    .catch(error => console.log(error.message))
})
