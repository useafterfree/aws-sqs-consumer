'use strict'

const Promise = require('bluebird')
const Consumer = require('./Consumer')
const ConsumerDefaults = require('./ConsumerDefaults')

/**
 * ConsumerManagerService Class
 *
 * @type {ConsumerManager}
 */
module.exports = class ConsumerManager {
  /**
   * Set the strategy on construction
   *
   * @param (Number) poolSize
   * @param (Object|null} options
   */
  constructor (poolSize = 1, options = {}) {
    this.consumers = []
    this.poolSize = poolSize
    this.empty = true
    this.consumerDefaults = new ConsumerDefaults(options)
  }

  addConsumer () {
    this.consumers.push(this.createConsumer())
  }

  async createPool () {
    await Promise.map(Array(this.poolSize), () => this.addConsumer(), {
      concurrency: this.poolSize
    })

    this.checkEmpty()
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
    const manager = this

    await Promise.map(manager.consumers, consumer => consumer.stop(), {
      concurrency: 10
    })

    // empty array
    this.removeStoppedConsumers()
  }

  /**
   *
   * @returns {Consumer}
   */
  createConsumer () {
    return new Consumer(this.consumerDefaults)
  }

  isEmpty () {
    return this.empty
  }

  checkEmpty () {
    setTimeout(() => {
      this.empty = this.consumers.every(consumer => consumer.empty)

      this.checkEmpty()
    }, 500)
  }
}
