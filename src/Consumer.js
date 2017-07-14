import { EventEmitter } from 'events'
import AWS from 'aws-sdk'
import _ from 'lodash'
import Promise from 'bluebird'
import winston from 'winston'

/**
 * Construct a new SQSError
 */
class SQSError extends Error {}

/**
 * Consumer Class
 *
 * @type {Consumer}
 */
export default class Consumer extends EventEmitter {
  constructor (options) {
    super()

    this.validate(options)

    this.queueUrl = options.queueUrl
    this.handleMessage = options.handleMessage
    this.attributeNames = options.attributeNames || []
    this.messageAttributeNames = options.messageAttributeNames || []
    this.stopped = true
    this.batchSize = options.batchSize || 1
    this.visibilityTimeout = options.visibilityTimeout || 120
    this.waitTimeSeconds = options.waitTimeSeconds || 20
    this.authenticationErrorTimeout = options.authenticationErrorTimeout || 10000

    this.sqs = options.sqs || new AWS.SQS({
      endpoint: options.queueUrl,
      region: options.region || 'us-east-1'
    })

    // set a lock
    this.pollLock = false

    // set event processing
    this.setEventProcessing()

    // start this consumer
    this.start()
  }

  validate (options) {
    if ((!options.queueUrl || !options.sqs) || !options.handleMessage) {
      throw new Error('Missing SQS consumer option queueUrl, sqs, or handleMessage function')
    }

    // verify batch size
    if (options.batchSize > 10 || options.batchSize < 1) {
      throw new Error('SQS batchSize option must be between 1 and 10.')
    }
  }

  isAuthenticationError (err) {
    return (err.statusCode === 403 || err.code === 'CredentialsError')
  }

  start () {
    winston.info('Starting consumer')

    // if stopped
    if (this.stopped) {
      this.stopped = false
    }

    return this.poll()
  }

  /**
   * Stop polling for messages.
   */
  stop () {
    winston.info('Stopping consumer')
    this.stopped = true
    this.emit('stopped')
  }

  async poll () {
    if (this.pollLock || this.stopped) {
      // delay the next poll for 1 seconds
      return _.delay(() => this.poll, 1000)
    }

    const consumer = this
    this.pollLock = true

    try {
      const response = await this.receiveMessages()

      // open the lock
      consumer.pollLock = false

      await consumer.handleSqsResponse(response)
    } catch (error) {
      consumer.pollLock = false

      this.emit('error', new SQSError(`SQS receive message failed: ${error.message}`))

      // if authentication error
      if (consumer.isAuthenticationError(error)) {
        winston.info('There was an authentication error. Pausing before retrying.')

        await Promise.delay(consumer.authenticationErrorTimeout)
      }

      return consumer.poll()
    }
  }

  getParams () {
    return {
      QueueUrl: this.queueUrl,
      AttributeNames: this.attributeNames,
      MessageAttributeNames: this.messageAttributeNames,
      MaxNumberOfMessages: this.batchSize,
      WaitTimeSeconds: this.waitTimeSeconds,
      VisibilityTimeout: this.visibilityTimeout
    }
  }

  async handleSqsResponse (response) {
    const consumer = this

    // if response
    if (consumer.responseHasMessages(response)) {
      await Promise.map(response.Messages, message => consumer.processMessage(message), {
        concurrency: 10
      })

      await consumer.deleteMessageBatch(response.Messages)
    }

    consumer.emit('empty')
  }

  async processMessage (message) {
    const consumer = this

    this.emit('message_received', message)

    try {
      await Promise.resolve(consumer.handleMessage(message))

      return consumer.emit('message_processed', message)
    } catch (error) {
      winston.error(error)

      if (_.eq(error.name, SQSError.name)) {
        return consumer.emit('error', message, error)
      }

      // normal processing error
      return consumer.emit('processing_error', message, error)
    }
  }

  async deleteMessage (message) {
    winston.info('Deleting message %s', message.MessageId)

    return new Promise((resolve, reject) => {
      this.sqs.deleteMessage({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.ReceiptHandle
      }, (error, result) => {
        if (error) {
          return reject(new SQSError(`SQS delete message failed: ${error.message}`))
        }

        return resolve(result)
      })
    })
  }

  deleteMessageBatch (messages) {
    const Entries = messages.map(message => ({
      ReceiptHandle: message.ReceiptHandle,
      Id: message.MessageId
    }))

    return new Promise((resolve, reject) => {
      this.sqs.deleteMessageBatch({QueueUrl: this.queueUrl, Entries}, (error, result) => {
        if (error) {
          return reject(new SQSError(`SQS delete message failed: ${error.message}`))
        }

        return resolve(result)
      })
    })
  }

  /**
   * If the response has messages
   *
   * @param {Object} response
   * @returns {*|Messages|{locationName, type, member}|{type, member}|{type, member, flattened}|boolean}
   */
  responseHasMessages (response) {
    return _.isObject(response) && _.has(response, 'Messages') && response.Messages.length > 0
  }

  /**
   * Receive messages from the queue
   */
  async receiveMessages () {
    const consumer = this

    return new Promise((resolve, reject) => {
      consumer.sqs.receiveMessage(consumer.getParams(), (error, response) => {
        if (error) return reject(error)

        return resolve(response)
      })
    })
  }

  /**
   * This sets what should happen
   * when lifecycle events are emitted
   */
  setEventProcessing (options) {
    const consumer = this

    // message event
    consumer.on('message_received', (message) => {
      options.events.messageReceived()
    })

    // error event
    consumer.on('error', (message, error) => {
      winston.error(error)

      options.events.error(message, error)
    })

    // error event
    consumer.on('processing_error', (message, error) => {
      winston.error(error)

      options.events.processingError(message, error)
    })

    // message event
    consumer.on('message_processed', (message) => {
      options.events.messageProcessed(message)
    })

    // queue is empty so scale down workers
    consumer.on('empty', () => {
      options.events.empty()
    })

    // on stopped maybe we should continue polling
    consumer.on('stopped', () => {
      consumer.poll()

      options.events.stopped()
    })
  }
}
