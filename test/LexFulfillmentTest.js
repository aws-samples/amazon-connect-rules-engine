// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const expect = require('chai').expect;
const AWSMock = require('aws-sdk-mock');
const config = require('./utils/config');
const dynamoStateTableMocker = require('./utils/DynamoStateTableMocker');
const dynamoUtils = require('../lambda/utils/DynamoUtils');
const configUtils = require('../lambda/utils/ConfigUtils');
const keepWarmUtils = require('../lambda/utils/KeepWarmUtils');
const lexFulfillment = require('../lambda/LexFulfillment');

/**
 * LexFulfillment tests
 */
describe('LexFulfillmentTests', function()
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
  it('LexFulfillment.handler() non test event', async function()
  {
    var contactId = 'blerrrgggg';
    var event = {
      sessionId: contactId,
      bot: {
        name: 'unittesting-rules-engine-happy-days'
      },
      interpretations:
      [
        {
          intent:
          {
            slots: {},
            confirmationState: 'None',
            name: 'Sales',
            state: 'InProgress'
          },
          nluConfidence: 0.5
        }
      ]
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
    var response = await lexFulfillment.handler(event, {});

    expect(response.sessionState.intent.state).to.equal('Fulfilled');
    expect(response.sessionState.intent.confirmationState).to.equal('Confirmed');
    expect(response.sessionState.dialogAction.type).to.equal('Close');
    expect(response.sessionState.fulfillmentState).to.equal('Fulfilled');

    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
    console.info('Got updated state: ' + JSON.stringify(newState, null, 2));

    expect(JSON.stringify(newState.LexResponses.happy_days)).to.equal(JSON.stringify(event));
  });

  // Tests non-test execution random bot
  it('LexFulfillment.handler() non test event number bot', async function()
  {
    var contactId = 'blerrrgggg';
    var event =
    {
      sessionId: contactId,
      inputTranscript: '5555',
      bot:
      {
        name: 'unittesting-rules-engine-number'
      },
      interpretations:
      [
        {
          intent:
          {
            slots: {
              dataslot: {
                shape: 'Scalar',
                value: {
                  originalValue: '5555',
                  resolvedValues: [
                    '5555'
                  ],
                  interpretedValue: '5555'
                }
              }
            },
            confirmationState: 'None',
            name: 'intentdata',
            state: 'InProgress'
          },
          nluConfidence: 1
        }
      ]
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
    var response = await lexFulfillment.handler(event, {});

    expect(response.sessionState.dialogAction.type).to.equal('Close');

    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    console.info('Got updated state: ' + JSON.stringify(newState, null, 2));

    // Note that the stage for testing is unitesting so this bot won't be normalised name wise in state
    // this is expected behaviour and might occur with non-rulesengine bots getting given the fulfilment
    // Lambda function
    expect(JSON.stringify(newState.LexResponses.number)).to.equal(JSON.stringify(event));
  });

  // Tests the test execution with no existing events
  it('LexFulfillment.handler() test event with no existing bot response', async function()
  {
    var contactId = 'test-blerrrgggg';
    var event = {
      sessionId: contactId,
      bot: {
        name: 'unittesting-rules-engine-intent'
      },
      interpretations:
      [
        {
          intent:
          {
            slots: {},
            confirmationState: 'None',
            name: 'FallbackIntent',
            state: 'InProgress'
          }
        }
      ]
    };

    var state = {};
    dynamoStateTableMocker.injectState(contactId, state);
    await lexFulfillment.handler(event, {});
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
    console.info('Got updated state: ' + JSON.stringify(newState, null, 2));
    expect(newState.LexResponses).to.equal(undefined);
  });


  // Tests the test execution with existing events
  it('LexFulfillment.handler() test event with existing bot response', async function()
  {
    var contactId = 'test-blerrrgggg';
    var event = {
      sessionId: contactId,
      bot: {
        name: 'unittesting-rules-engine-intent'
      },
      interpretations:
      [
        {
          intent:
          {
            slots: {},
            confirmationState: 'None',
            name: 'FallbackIntent',
            state: 'InProgress'
          }
        }
      ]
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
    await lexFulfillment.handler(event, {});
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    console.info('Got updated state: ' + JSON.stringify(newState, null, 2));

    expect(newState.LexResponses.foo.bot.name).to.equal('unittesting-rules-engine-foo');
    expect(JSON.stringify(newState.LexResponses.intent)).to.equal(undefined);
  });

  // Tests a random bot response
  it('LexFulfillment.handler() random bot response', async function()
  {
    var contactId = 'blerrrgggg';
    var event = {
      sessionId: contactId,
      bot: {
        name: 'my-cool-bot'
      },
      interpretations:
      [
        {
          intent:
          {
            slots: {},
            confirmationState: 'None',
            name: 'FallbackIntent',
            state: 'InProgress'
          }
        }
      ]
    };

    var state = {};

    dynamoStateTableMocker.injectState(contactId, state);
    await lexFulfillment.handler(event, {});
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    console.info('Got updated state: ' + JSON.stringify(newState, null, 2));

    expect(JSON.stringify(newState.LexResponses.my_cool_bot)).to.equal(JSON.stringify(event));
  });

  // Tests keep warm
  it('LexFulfillment.handler() keep warm', async function()
  {
    var event = keepWarmUtils.createKeepWarmRequest('lexfulfillment', 'some arn');
    var response = await lexFulfillment.handler(event, {});
    expect(keepWarmUtils.isKeepWarmResponse(response)).to.equal(true);
  });


  // Tests keep warm
  it('LexFulfillment.handler() missing session id', async function()
  {
    var contactId = undefined;
    var event = {
      sessionId: contactId,
      bot: {
        name: 'unittesting-rules-engine-intent'
      },
      interpretations:
      [
        {
          intent:
          {
            slots: {},
            confirmationState: 'None',
            name: 'FallbackIntent',
            state: 'InProgress'
          }
        }
      ]
    };

    try
    {
      await lexFulfillment.handler(event, {});
      throw new Error('Expected a failure with a missing session id');
    }
    catch (error)
    {
      expect(error.message).to.equal('Required field is missing: sessionId');
    }

  });

});
