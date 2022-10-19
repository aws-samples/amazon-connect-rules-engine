// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const expect = require('chai').expect;
const sinon = require('sinon');
const AWSMock = require('aws-sdk-mock');
const config = require('./utils/config');
const configUtils = require('../lambda/utils/ConfigUtils');
const connectCustomerQueue = require('../lambda/ConnectCustomerQueue');
const dynamoStateTableMocker = require('./utils/DynamoStateTableMocker');
const dynamoUtils = require('../lambda/utils/DynamoUtils');
const keepWarmUtils = require('../lambda/utils/KeepWarmUtils');
const snsUtils = require('../lambda/utils/SNSUtils');

function setupSinon()
{
  var getConfigItems = sinon.fake.returns(
    {
      Prompts:
      [
        {
          Name: 'SomeWav.wav',
          Arn: 'prompt arn here'
        }
      ]
    }
  );

  var checkLastChange = sinon.fake.returns(false);
  var sendSMS = sinon.fake.returns(undefined);

  sinon.replace(configUtils, 'getConfigItems', getConfigItems);
  sinon.replace(configUtils, 'checkLastChange', checkLastChange);
  sinon.replace(snsUtils, 'sendSMS', sendSMS);
}

/**
 * ConnectCustomerQueue tests
 */
describe('ConnectCustomerQueueTests', function()
{
  this.beforeAll(function () {
    config.loadEnv();
    AWSMock.restore();
    // Mock state loading and saving
    dynamoStateTableMocker.setupMockDynamo(AWSMock, dynamoUtils);

    setupSinon();
  });

  this.afterAll(function () {
    AWSMock.restore('DynamoDB');
    sinon.restore();
  });

  // Test fetching missing queue behaviours
  it('ConnectCustomerQueue.getQueueBehaviours() no queue behaviour configured', async function()
  {
    var contactId = 'test-contact-id';

    var customerState =
    {
      ContactId: contactId,
      System: {},
      CurrentRule_ruleType: 'Queue'
    };

    dynamoStateTableMocker.injectState(contactId, customerState);

    var queueBehaviours = connectCustomerQueue.getQueueBehaviours(contactId, customerState);
    expect(queueBehaviours.length).to.equal(0);
  });


  // Test fetching valid queue behaviours
  it('ConnectCustomerQueue.getQueueBehaviours() queue behaviours configured', async function()
  {
    var contactId = 'test-contact-id';

    var queueBehaviours = [
      {
        type: 'Message',
        message: 'Hey!',
        weights: [],
        activation: 0
      }
    ];

    var customerState =
    {
      ContactId: contactId,
      System: {},
      CurrentRule_ruleType: 'Queue',
      CurrentRule_queueBehaviours: queueBehaviours
    };

    dynamoStateTableMocker.injectState(contactId, customerState);

    var queueBehaviours = connectCustomerQueue.getQueueBehaviours(contactId, customerState);
    expect(queueBehaviours.length).to.equal(1);
    expect(queueBehaviours[0].type).to.equal('Message');
  });

  // Test fetching state index
  it('ConnectCustomerQueue.getQueueBehaviourIndex()', async function()
  {
    var contactId = 'test-contact-id';

    var customerState =
    {
      ContactId: contactId,
      System: {},
      CurrentRule_ruleType: 'Queue',
      CurrentRule_queueBehaviourIndex: undefined
    };

    dynamoStateTableMocker.injectState(contactId, customerState);

    var index = connectCustomerQueue.getQueueBehaviourIndex(contactId, customerState);

    expect(index).to.equal(0);

    customerState =
    {
      ContactId: contactId,
      System: {},
      CurrentRule_ruleType: 'Queue',
      CurrentRule_queueBehaviourIndex: 42
    };

    dynamoStateTableMocker.injectState(contactId, customerState);

    var index = connectCustomerQueue.getQueueBehaviourIndex(contactId, customerState);

    expect(index).to.equal(42);

  });

  // Test incrementing behaviour index
  it('ConnectCustomerQueue.incrementQueueBehaviourIndex()', async function()
  {
    var contactId = 'test-contact-id';

    var customerState =
    {
      ContactId: contactId,
      System: {},
      CurrentRule_ruleType: 'Queue',
      CurrentRule_queueBehaviourIndex: 1
    };

    var stateToSave = new Set();

    connectCustomerQueue.incrementQueueBehaviourIndex(contactId, customerState, stateToSave);

    expect(stateToSave.size).to.equal(1);
    expect(stateToSave.has('CurrentRule_queueBehaviourIndex')).to.equal(true);
    expect(customerState.CurrentRule_queueBehaviourIndex).to.equal('2');
  });


  // Test pruning old state
  it('ConnectCustomerQueue.pruneOldBehaviourState()', async function()
  {
    var contactId = 'test-contact-id';

    var queueBehaviours = [
      {
        type: 'Message',
        message: 'Hey!',
        weights: [],
        activation: 0
      }
    ];

    var customerState =
    {
      ContactId: contactId,
      System: {},
      CurrentRule_ruleType: 'Queue',
      QueueBehaviour_type: 'Message',
      QueueBehaviour_message: 'Hey!',
      CurrentRule_queueBehaviours: queueBehaviours,
      CurrentRule_queueBehaviourIndex: 1
    };

    dynamoStateTableMocker.injectState(contactId, customerState);

    var stateToSave = new Set();

    connectCustomerQueue.pruneOldBehaviourState(contactId, customerState, stateToSave);

    expect(stateToSave.size).to.equal(2);
    expect(stateToSave.has('QueueBehaviour_type')).to.equal(true);
    expect(customerState.QueueBehaviour_type).to.equal(undefined);
    expect(stateToSave.has('QueueBehaviour_message')).to.equal(true);
    expect(customerState.QueueBehaviour_message).to.equal(undefined);
  });

  // Text execution
  it('ConnectCustomerQueue.handler() vanilla execution text with GOTO', async function()
  {
    var contactId = 'test-contact-id';

    var queueBehaviours = [
      {
        type: 'Message',
        message: '{{CustomerCoolMessage}} there!!!',
        weights: [],
        activation: 0
      },
      {
        type: 'GOTO',
        index: 0,
        weights: [],
        activation: 0
      },
    ];

    var customerState =
    {
      ContactId: contactId,
      System: {},
      CustomerCoolMessage: 'Yo',
      CurrentRule_ruleType: 'Queue',
      CurrentRule_queueBehaviours: queueBehaviours
    };

    dynamoStateTableMocker.injectState(contactId, customerState);

    var context = {};

    var event =
    {
      Details:
      {
        ContactData:
        {
          InitialContactId: contactId
        }
      }
    };

    var result = await connectCustomerQueue.handler(event, context);
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    expect(newState.CurrentRule_queueBehaviourIndex).to.equal('1');
    expect(newState.QueueBehaviour_type).to.equal('Message');
    expect(newState.QueueBehaviour_message).to.equal('Yo there!!!');
    expect(newState.QueueBehaviour_messageType).to.equal('text');

    result = await connectCustomerQueue.handler(event, context);
    newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    expect(newState.CurrentRule_queueBehaviourIndex).to.equal('0');
    expect(newState.QueueBehaviour_type).to.equal('GOTO');
    expect(newState.QueueBehaviour_message).to.equal(undefined);
    expect(newState.QueueBehaviour_messageType).to.equal(undefined);

    result = await connectCustomerQueue.handler(event, context);
    newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    expect(newState.CurrentRule_queueBehaviourIndex).to.equal('1');
    expect(newState.QueueBehaviour_type).to.equal('Message');
    expect(newState.QueueBehaviour_message).to.equal('Yo there!!!');
    expect(newState.QueueBehaviour_messageType).to.equal('text');
  });

  // SSML execution
  it('ConnectCustomerQueue.handler() vanilla execution ssml', async function()
  {
    var contactId = 'test-contact-id';

    var queueBehaviours = [
      {
        type: 'Message',
        message: '<speak>Yo!</speak>',
        weights: [],
        activation: 0
      },
      {
        type: 'GOTO',
        index: 0,
        weights: [],
        activation: 0
      },
    ];

    var customerState =
    {
      ContactId: contactId,
      System: {},
      CurrentRule_ruleType: 'Queue',
      CurrentRule_queueBehaviours: queueBehaviours
    };

    dynamoStateTableMocker.injectState(contactId, customerState);

    var context = {};

    var event =
    {
      Details:
      {
        ContactData:
        {
          InitialContactId: contactId
        }
      }
    };

    var result = await connectCustomerQueue.handler(event, context);

    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    expect(newState.CurrentRule_queueBehaviourIndex).to.equal('1');
    expect(newState.QueueBehaviour_type).to.equal('Message');
    expect(newState.QueueBehaviour_message).to.equal('<speak>Yo!</speak>');
    expect(newState.QueueBehaviour_messageType).to.equal('ssml');
  });

  // Prompt message
  it('ConnectCustomerQueue.handler() vanilla execution prompt', async function()
  {
    var contactId = 'test-contact-id';

    var queueBehaviours = [
      {
        type: 'Message',
        message: 'prompt:SomeWav.wav \n#Foo',
        weights: [],
        activation: 0
      },
      {
        type: 'GOTO',
        index: 0,
        weights: [],
        activation: 0
      },
    ];

    var customerState =
    {
      ContactId: contactId,
      System: {},
      CurrentRule_ruleType: 'Queue',
      CurrentRule_queueBehaviours: queueBehaviours
    };

    dynamoStateTableMocker.injectState(contactId, customerState);

    var context = {};

    var event =
    {
      Details:
      {
        ContactData:
        {
          InitialContactId: contactId
        }
      }
    };

    var result = await connectCustomerQueue.handler(event, context);

    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    expect(newState.CurrentRule_queueBehaviourIndex).to.equal('1');
    expect(newState.QueueBehaviour_type).to.equal('Message');
    expect(newState.QueueBehaviour_message).to.equal('prompt:SomeWav.wav \n#Foo');
    expect(newState.QueueBehaviour_messagePromptArn).to.equal('prompt arn here');
    expect(newState.QueueBehaviour_messageType).to.equal('prompt');
  });

});
