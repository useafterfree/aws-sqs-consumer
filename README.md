# aws-sqs-consumer
Consumers for AWS SQS - Promise based

## Description

Create a pool of consumers to consume many messages/jobs at once and increase concurrency. You can scale the number of consumers up and down easily. This package was created after reviewing the inner workings of [sqs-consumer](https://www.npmjs.com/package/sqs-consumer). 

## Getting Started

You will need the following environment variables set: 

```
AWS_ACCESS_KEY_ID=<your-access-key-id>
AWS_SECRET_ACCESS_KEY=<your-access-key>
```

You can accomplish this by using [dotenv](https://www.npmjs.com/package/dotenv) if you like. Use their documentation for reference.

Import the `ConsumerManager` into your project. First params is the pool size and the second is the options object. 

```
const {ConsumerManager, Consumer} =  require('aws-sqs-consumer')

const manager = new ConsumerManager(2, {
    queueUrl: 'https://www.queueurl.com',
    handleMessage: async (message) => {
        
        return yourCustomFunction(message)
    }
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
  queueUrl: 'http://that.queueurl.io',
  sqs: new AWS.SQS() // prebuilt sqs object,
  log: winston // default is console
  region: 'us-east-1', // AWS region
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

Each consumer will grab 10 messages at a time if you leave the default, which is the max AWS SQS allows. This means for n number of consumers, to get the concurrent number of messages being processed, you would just do n * 10. 

Default polling is set to short polling. If you pass `waitTimeSeconds`, this will cause long polling. 
