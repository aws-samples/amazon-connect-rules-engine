// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const expect = require('chai').expect;
const AWSMock = require('aws-sdk-mock');
const config = require('./utils/config');
const dynamoStateTableMocker = require('./utils/DynamoStateTableMocker');
const dynamoUtils = require('../lambda/utils/DynamoUtils');
const configUtils = require('../lambda/utils/ConfigUtils');
const keepWarmUtils = require('../lambda/utils/KeepWarmUtils');
const lexFulfilment = require('../lambda/LexFulfilment');

/**
 * LexFulfilment tests
 */
describe('LexFulfilmentTests', function()
{
  this.beforeAll(function()
  {
    config.loadEnv();
    AWSMock.restore();
    // Mock state loading and saving
    dynamoStateTableMocker.setupMockDynamo(AWSMock, dynamoUtils);
  });

  this.afterAll(function()
  {
    AWSMock.restore('DynamoDB');
  });

  // Tests non-test execution
  it('LexFulfilment.handler() non test event', async function()
  {
    var contactId = 'blerrrgggg';
    var event = {
      sessionId: contactId,
      bot: {
        name: 'unittesting-rules-engine-happy-days'
      }
    };

    var state = {
      LexResponses: {
        foo: {
          bot:{
            name: 'unittesting-rules-engine-foo'
          }
        }
      }
    };

    dynamoStateTableMocker.injectState(contactId, state);
    await lexFulfilment.handler(event, {});
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    console.info('Got updated state: ' + JSON.stringify(newState, null, 2));

    expect(JSON.stringify(newState.LexResponses.happy_days)).to.equal(JSON.stringify(event));
  });

  // Tests non-test execution random bot
  it('LexFulfilment.handler() non test event random bot', async function()
  {
    var contactId = 'blerrrgggg';
    var event = {
      sessionId: contactId,
      bot: {
        name: 'dev-rules-engine-intent'
      }
    };

    var state = {
      LexResponses: {
        foo: {
          bot:{
            name: 'dev-rules-engine-foo'
          }
        }
      }
    };

    dynamoStateTableMocker.injectState(contactId, state);
    await lexFulfilment.handler(event, {});
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    console.info('Got updated state: ' + JSON.stringify(newState, null, 2));

    // Note that the stage for testing is unitesting so this bot won't be normalised name wise in state
    // this is expected behaviour and might occur with non-rulesengine bots getting given the fulfilment
    // Lambda function
    expect(JSON.stringify(newState.LexResponses.dev_rules_engine_intent)).to.equal(JSON.stringify(event));
  });

  // Tests the test execution with no existing events
  it('LexFulfilment.handler() test event with no existing bot response', async function()
  {
    var contactId = 'test-blerrrgggg';
    var event = {
      sessionId: contactId,
      bot: {
        name: 'unittesting-rules-engine-intent'
      }
    };

    var state = {};
    dynamoStateTableMocker.injectState(contactId, state);
    await lexFulfilment.handler(event, {});
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
    console.info('Got updated state: ' + JSON.stringify(newState, null, 2));
    expect(newState.LexResponses).to.equal(undefined);
  });


  // Tests the test execution with existing events
  it('LexFulfilment.handler() test event with existing bot response', async function()
  {
    var contactId = 'test-blerrrgggg';
    var event = {
      sessionId: contactId,
      bot: {
        name: 'unittesting-rules-engine-intent'
      }
    };

    var state = {
      LexResponses: {
        foo: {
          bot:{
            name: 'unittesting-rules-engine-foo'
          }
        }
      }
    };
    dynamoStateTableMocker.injectState(contactId, state);
    await lexFulfilment.handler(event, {});
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    console.info('Got updated state: ' + JSON.stringify(newState, null, 2));

    expect(newState.LexResponses.foo.bot.name).to.equal('unittesting-rules-engine-foo');
    expect(JSON.stringify(newState.LexResponses.intent)).to.equal(undefined);
  });

  // Tests keep warm
  it('LexFulfilment.handler() keep warm', async function()
  {
    var event = keepWarmUtils.createKeepWarmRequest('lexfulfilment', 'some arn');
    var response = await lexFulfilment.handler(event, {});
    expect(keepWarmUtils.isKeepWarmResponse(response)).to.equal(true);
  });


  // Tests keep warm
  it('LexFulfilment.handler() missing session id', async function()
  {
    var contactId = undefined;
    var event = {
      sessionId: contactId,
      bot: {
        name: 'unittesting-rules-engine-intent'
      }
    };

    try
    {
      await lexFulfilment.handler(event, {});
      throw new Error('Expected a failure with a missing session id');
    }
    catch (error)
    {
      expect(error.message).to.equal('Required field is missing: sessionId');
    }

  });

});
