import _ from 'lodash'

/**
 * ConsumerManagerService Class
 *
 * @type {ConsumerManagerService}
 */
export default class ConsumerManagerService {

  /**
   * Set the strategy on construction
   *
   * @param {Number|Null} amountOfConsumers
   * @param {String|Null} strategy
   */
  constructor(amountOfConsumers, strategy) {

    // create an array of consumers
    this.consumers = []

    // set the strategy
    this.strategy = strategy || 'runJobStrategy'

    // go ahead and create the pool
    this.createPool(amountOfConsumers || 1)
  }

  addConsumer() {

    this.consumers.push(this.createConsumer())
  }

  createPool(number) {

    // add a consumer if not 0
    if (number > 0) this.addConsumer()

    // if number is not 0
    if (--number > 0) {

      // call this function again
      return this.createPool(number)
    }
  }

  /**
   * Remove stopped consumers
   */
  removeStoppedConsumers() {

    // remove stopped consumers
    _.remove(this.consumers, consumer => consumer.stopped)
  }

  /**
   * Kill consumers in array
   */
  killPool() {

    // stop consumers
    _.each(this.consumers, consumer => consumer.stop())

    // empty array
    this.consumers = []
  }

  // create a consumer
  createConsumer() {

    let self = this

    // create the consumer
    return new Consumer({
      queueUrl: process.env.SQS_WORKER_QUEUE,
      batchSize: 10,
      handleMessage: message => {

        try {

          // if invoke lambda strategy
          if (_.eq(self.strategy, 'invokeLambdaStrategy')) {

            // invoke lambda function
            return self.invokeLambdaStrategy(message)
          }

          return self.runJobStrategy(message)
        }
        catch (error) {

          return Promise.reject(error)
        }
      }
    })
  }

  /**
   * Handle the message strategy
   *
   * @param {Object} message
   * @returns {*}
   */
  handleMessageStrategy(message) {

    try {

      // if invoke lambda strategy
      if (_.eq(this.strategy, 'invokeLambdaStrategy')) {

        // invoke lambda function
        return this.invokeLambdaStrategy(message)
      }

      return this.runJobStrategy(message)
    }
    catch (error) {

      return Promise.reject(error)
    }
  }

  /**
   * Strategy for running the job
   *
   * @param {Object} message
   */
  runJobStrategy(message) {

    // parse the message body
    let worker = JSON.parse(message.Body)

    // run the worker
    return WorkerService.run(worker)
  }

  /**
   * Strategy for invoking lambda functions
   *
   * @param {Object} message
   */
  invokeLambdaStrategy(message) {

    return LambdaService.invoke(process.env.WORKER_LAMBDA_FUNCTION_NAME, message.Body)
  }
}