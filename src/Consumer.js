import { EventEmitter } from 'events';
import util from 'util';
import AWS from 'aws-sdk';
import _ from 'lodash';
import Promise from 'bluebird';

/**
 * Construct a new SQSError
 */
function SQSError(message) {
  Error.captureStackTrace(this, this.constructor)
  this.name = this.constructor.name
  this.message = (message || '')
}

util.inherits(SQSError, Error)

/**
 * Create the class
 */
export default class Consumer extends EventEmitter {

  constructor(options) {

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

    this.sqs = options.sqs || new AWS.SQS({ endpoint: options.queueUrl, region: options.region || 'us-east-1' })

    // set a lock
    this.pollLock = false

    // set event processing
    this.setEventProcessing()

    // start this consumer
    this.start()
  }

  validate(options) {

    // Ensure required options are filled in
    _.each(['queueUrl', 'handleMessage'], option => {

      if (!options[option]) {

        throw new Error('Missing SQS consumer option [' + option + '].')
      }
    })

    // verify batch size
    if (options.batchSize > 10 || options.batchSize < 1) {

      throw new Error('SQS batchSize option must be between 1 and 10.')
    }
  }

  isAuthenticationError(err) {

    return (err.statusCode === 403 || err.code === 'CredentialsError')
  }

  start() {

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
  stop() {

    winston.info('Stopping consumer')
    this.stopped = true
    this.emit('stopped')
  }

  async poll() {

    // if polling already happening or stopped
    if (this.pollLock || this.stopped) {

      // delay the next poll for 1 seconds
      return _.delay(() => this.poll, 1000)
    }

    let consumer = this
    this.pollLock = true

    try {

      let response = await this.receiveMessages()

      // open the lock
      consumer.pollLock = false

      await consumer.handleSqsResponse(response)
    }
    catch (error) {

      // open the lock
      consumer.pollLock = false

      this.emit('error', new SQSError('SQS receive message failed: ' + error.message))

      // if authentication error
      if (consumer.isAuthenticationError(error)) {

        // there was an authentication error, so wait a bit before repolling
        winston.info('There was an authentication error. Pausing before retrying.')

        await Promise.delay(consumer.authenticationErrorTimeout)
      }

      return await consumer.poll()
    }
  }

  getParams() {

    return {
      QueueUrl: this.queueUrl,
      AttributeNames: this.attributeNames,
      MessageAttributeNames: this.messageAttributeNames,
      MaxNumberOfMessages: this.batchSize,
      WaitTimeSeconds: this.waitTimeSeconds,
      VisibilityTimeout: this.visibilityTimeout
    }
  }

  async handleSqsResponse(response) {

    let consumer = this

    // if response
    if (consumer.responseHasMessages(response)) {

      await Promise.map(response.Messages, message => consumer.processMessage(message), { concurrency: 10 })

      await consumer.deleteMessageBatch(response.Messages)
    }

    consumer.emit('empty')
  }

  async processMessage(message) {

    let consumer = this

    this.emit('message_received', message)

    await Promise.resolve(consumer.handleMessage(message))
      .then(() => {

        consumer.emit('message_processed', message)
      })
      .catch(error => {

        winston.error(error)
        // if an error with the queue
        if (_.eq(error.name, SQSError.name)) {

          return consumer.emit('error', message, error)
        }

        // normal processing error
        consumer.emit('processing_error', message, error)
      })
  }

  async deleteMessage(message) {

    winston.info('Deleting message %s', message.MessageId)

    return await new Promise((resolve, reject) => {

      this.sqs.deleteMessage({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle }, (error, result) => {

        if (error) {

          return reject(new SQSError('SQS delete message failed: ' + error.message))
        }

        resolve(result)
      })
    })
  }

  deleteMessageBatch(messages) {

    // create the entries
    let Entries = _.map(messages, message => ({ ReceiptHandle: message.ReceiptHandle, Id: message.MessageId }))

    return new Promise((resolve, reject) => {

      this.sqs.deleteMessageBatch({ QueueUrl: this.queueUrl, Entries }, (error, result) => {

        if (error) {

          return reject(new SQSError('SQS delete message failed: ' + error.message))
        }

        resolve(result)
      })
    })
  }

  /**
   * If the response has messages
   *
   * @param {Object} response
   * @returns {*|Messages|{locationName, type, member}|{type, member}|{type, member, flattened}|boolean}
   */
  responseHasMessages(response) {

    return _.isObject(response) && _.has(response, 'Messages') && response.Messages.length > 0
  }

  /**
   * Receive messages from the queue
   */
  async receiveMessages() {

    let consumer = this

    return await new Promise((resolve, reject) => {

      consumer.sqs.receiveMessage(consumer.getParams(), (error, response) => {

        if (error) return reject(error)

        resolve(response)
      })
    })
  }

  /**
   * This sets what should happen
   * when lifecycle events are emitted
   */
  setEventProcessing() {

    let consumer = this

    //////////////////////////////////////////////////////////////////////
    // LifeCycle Events
    //////////////////////////////////////////////////////////////////////

    // message event
    consumer.on('message_received', (message) => {

    })

    // error event
    consumer.on('error', (message, error) => {

      ErrorService.captureError(error)

      // Turning off for now
      //WorkerService.createJobTrail(message, error)
    })

    // error event
    consumer.on('processing_error', (message, error) => {

      ErrorService.captureError(error)

      // Turning off for now
      //WorkerService.createJobTrail(message)
    })

    // message event
    consumer.on('message_processed', (message) => {

    })

    // queue is empty so scale down workers
    consumer.on('empty', () => WorkerService.scaleDownDelay())

    // on stopped maybe we should continue polling
    consumer.on('stopped', () => consumer.poll())
  }
}
