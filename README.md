# aws-sqs-consumer
Consumers for AWS SQS - Promise based

## Description

Create a pool of consumers to consume many messages/jobs at once and increase concurrency. You can scale the number of consumers up and down easily. This package was created after reviewing the inner workings of [sqs-consumer](https://www.npmjs.com/package/sqs-consumer).

## Very early -- use at your own risk

I am still getting tests together for this early version and this is not battle tested. 

## Getting Started

Import the `ConsumerManagerService` into your project.

```
import ConsumerManagerService from 'aws-sqs-consumer'

const manager = new ConsumerManagerService({
    queueUrl: 'https://www.queueurl.com',
    amountOfConsumers: 1,
})
```

## Possible Options

```
{
  batchSize: 10,
  attributeNames: [],
  messageAttributeNames: [],
  visibilityTimeout: 120,
  waitTimeSeconds: 20,
  authenticationErrorTimeout: 10000,
  amountOfConsumers: 1,
  queueUrl: 'http://that.queueurl.io',
  sqs: new AWS.SQS() // prebuilt sqs object,
  handleMessage: (message) => {
    
    // add your custom logic here. Remember, this is promise based!
  },
  events: {
    messageReceived: (message) => {},
    error: (message, error) => {},
    processingError: (message, error) => {},
    messageProcessed: (message) => {},
    empty: () => {},
    stopped: () => {},
  }
}
```

The events section contains possible event functions you can pass in for custom functionality. 



