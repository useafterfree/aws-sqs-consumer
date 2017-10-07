'use strict'

const test = require('ava')
const {ConsumerManager} = require('./../src/')
const Promise = require('bluebird')
const Chance = require('chance')
const {chunk} = require('lodash')
const messagePlan = 50

require('dotenv').config({path: `${__dirname}/../.env`})

const generator = new Chance()

test.cb('multiple consumers', t => {
  t.plan(messagePlan + 1)

  const manager = new ConsumerManager(2, {
    queueUrl: process.env.SQS_ENDPOINT,
    handleMessage: (message) => {
      t.true(message.Body.length > 0)
      return Promise.resolve(true)
    }
  })

  manager.createPool()
    .then(() => {
      t.is(manager.consumers.length, 2, 'number of consumers')

      const consumer = manager.consumers[0]
      const messages = []

      for (var i = 0; i < messagePlan; i++) {
        messages.push({
          Id: generator.guid(),
          MessageBody: generator.sentence()
        })
      }

      const chunked = chunk(messages, 10)

      const checkEmpty = () => {
        setTimeout(() => {
          if (manager.isEmpty()) {
            manager.killPool()
            return t.end()
          }

          checkEmpty()
        }, 1000)
      }

      Promise.map(chunked, async (block) => {
        await consumer.sqs.sendMessageBatch({
          Entries: block,
          QueueUrl: consumer.consumerDefaults.queueUrl
        }).promise().catch(error => console.log(error.message))
      })
        .then(checkEmpty)
    })
})
