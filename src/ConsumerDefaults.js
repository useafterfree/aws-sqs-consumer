'use strict'

module.exports = class ConsumerDefaults {
  constructor (options = {}) {
    this.setOptions(options)
  }

  setOptions (options) {
    this.validate(options)

    // retain cache of options passed
    this.options = options

    this.events = Object.assign({
      messageReceived: (message) => {},
      error: (message, error) => {},
      processingError: (message, error) => {},
      messageProcessed: (message) => {},
      empty: () => {},
      stopped: () => {}
    }, options.events || {})

    this.queueUrl = options.queueUrl
    this.handleMessage = options.handleMessage
    this.attributeNames = options.attributeNames || []
    this.messageAttributeNames = options.messageAttributeNames || []
    this.stopped = false
    this.batchSize = options.batchSize || 10
    this.visibilityTimeout = options.visibilityTimeout || 120
    this.waitTimeSeconds = options.waitTimeSeconds || 0
    this.authenticationErrorTimeout = options.authenticationErrorTimeout || 10000
  }

  validate (options) {
    if ((!options.queueUrl && !options.sqs)) {
      throw new Error('Missing option queueUrl (string) or sqs (object)')
    }

    if (!options.handleMessage) {
      throw new Error('Missing handleMessage (function) option')
    }

    // verify batch size
    if (options.batchSize > 10 || options.batchSize < 1) {
      throw new Error('SQS batchSize option must be between 1 and 10.')
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
}
