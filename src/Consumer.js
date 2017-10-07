'use strict'

const AWS = require('aws-sdk')
const Promise = require('bluebird')
const ConsumerDefaults = require('./ConsumerDefaults')

/**
 * Construct a new SQSError
 */
class SQSError extends Error {}

/**
 * Consumer Class
 *
 * @type {Consumer}
 */
module.exports = class Consumer {
  constructor (options = {}) {
    this.consumerDefaults = new ConsumerDefaults(options)

    this.sqs = options.sqs || new AWS.SQS({
      endpoint: options.queueUrl,
      region: options.region || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || options.accessKeyId,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || options.secretAccessKey
    })

    this.log = options.log || console
    this.emptyCount = 0
    this.empty = true

    // set a lock
    this.pollLock = false

    // start this consumer
    this.start()
  }

  isAuthenticationError (err) {
    return (err.statusCode === 403 || err.code === 'CredentialsError')
  }

  start () {
    this.log.info('Starting consumer')

    // if stopped
    if (this.stopped) {
      this.stopped = false
    }

    // purposely not handling the promise appropriately here
    // this creates a recursive function using timeouts
    // and direct self-reference calls
    this.poll()
  }

  /**
   * Stop polling for messages.
   */
  stop () {
    this.log.info('Stopping consumer')
    this.stopped = true
    this.consumerDefaults.events.stopped()
  }

  async poll () {
    const consumer = this

    if (consumer.stopped) {
      return
    }

    if (consumer.pollLock) {
      // delay the next poll for half a second
      setTimeout(() => {
        consumer.poll()
      }, 500)
      return
    }

    consumer.pollLock = true

    try {
      const response = await consumer.receiveMessages()

      // open the lock
      consumer.pollLock = false

      if (!consumer.responseHasMessages(response)) {
        setTimeout(() => consumer.emptyCount++, 500)

        if (consumer.emptyCount >= 5) {
          // reset
          consumer.emptyCount = 0
          consumer.empty = true

          consumer.consumerDefaults.events.empty()
        }
      } else {
        consumer.empty = false

        await consumer.handleSqsResponse(response)
        await consumer.deleteMessageBatch(response.Messages)
      }
    } catch (error) {
      consumer.pollLock = false

      console.log(consumer)
      consumer._error('SQS Error', new SQSError(`SQS receive message failed: ${error.message}`), consumer.consumerDefaults.events.error)

      // if authentication error
      if (consumer.isAuthenticationError(error)) {
        consumer.log.info('There was an authentication error. Pausing before retrying.')

        setTimeout(consumer.poll, consumer.consumerDefaults.authenticationErrorTimeout)

        return
      }
    }

    await consumer.poll()
  }

  async handleSqsResponse (response) {
    await Promise.map(response.Messages, message => this.processMessage(message), {
      concurrency: 10
    })
  }

  async processMessage (message) {
    this.consumerDefaults.events.messageReceived(message)

    try {
      await Promise.resolve(this.consumerDefaults.handleMessage(message))

      this.consumerDefaults.events.messageProcessed(message)
    } catch (error) {
      if (error.name === SQSError.name) {
        this._error(message, error, this.consumerDefaults.events.error)
        return
      }

      this._error(message, error, this.consumerDefaults.events.processingError)
    }
  }

  async deleteMessage (message) {
    this.log.info('Deleting message %s', message.MessageId)

    return this.sqs.deleteMessage({
      QueueUrl: this.queueUrl,
      ReceiptHandle: message.ReceiptHandle
    }).promise()
      .catch(error => {
        throw new SQSError(`SQS delete message failed: ${error.message}`)
      })
  }

  async deleteMessageBatch (messages) {
    const Entries = messages.map(message => ({
      ReceiptHandle: message.ReceiptHandle,
      Id: message.MessageId
    }))

    await this.sqs.deleteMessageBatch({QueueUrl: this.consumerDefaults.queueUrl, Entries})
      .promise()
      .catch(error => {
        throw new SQSError(`SQS delete message failed: ${error.message}`)
      })
  }

  /**
   * If the response has messages
   *
   * @param {Object} response
   * @returns {*|Messages|{locationName, type, member}|{type, member}|{type, member, flattened}|boolean}
   */
  responseHasMessages (response) {
    return response.Messages &&
      Array.isArray(response.Messages) &&
      response.Messages.length > 0
  }

  /**
   * Receive messages from the queue
   */
  async receiveMessages () {
    return this.sqs.receiveMessage(this.consumerDefaults.getParams()).promise()
  }

  _error (message, error, callback) {
    this.log.error(error)

    callback(message, error)
  }
}
