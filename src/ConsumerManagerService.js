import Promise from 'bluebird'
import Consumer from './Consumer'

/**
 * ConsumerManagerService Class
 *
 * @type {ConsumerManagerService}
 */
export default class ConsumerManagerService {
  /**
   * Set the strategy on construction
   *
   * @param (Object|null} options
   */
  constructor (options) {
    this.consumers = []

    this.defaults = Object.assign({
      batchSize: 10,
      attributeNames: [],
      messageAttributeNames: [],
      visibilityTimeout: 120,
      waitTimeSeconds: 20,
      authenticationErrorTimeout: 10000,
      amountOfConsumers: 1,
      handleMessage: () => {},
      events: {
        messageReceived: (message) => {},
        error: (message, error) => {},
        processingError: (message, error) => {},
        messageProcessed: (message) => {},
        empty: () => {},
        stopped: () => {}
      }
    }, options)

    // go ahead and create the pool
    this.createPool(this.defaults.amountOfConsumers)
  }

  addConsumer () {
    this.consumers.push(this.createConsumer())
  }

  async createPool () {
    return Promise.map(new Array(this.defaults.amountOfConsumers), this.addConsumer, {
      concurrency: this.defaults.amountOfConsumers
    })
  }

  /**
   * Remove stopped consumers
   */
  removeStoppedConsumers () {
    this.consumers = this.consumers.filter(consumer => !consumer.stopped)
  }

  /**
   * Kill consumers in array
   */
  async killPool () {
    await Promise.map(this.consumers, consumer => consumer.stop(), {
      concurrency: 10
    })

    // empty array
    this.consumers = this.removeStoppedConsumers()
  }

  /**
   *
   * @returns {Consumer}
   */
  createConsumer () {
    return new Consumer(this.defaults)
  }
}
