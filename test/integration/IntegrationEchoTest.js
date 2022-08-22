// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const sinon = require('sinon');
const expect = require('chai').expect;
const AWSMock = require('aws-sdk-mock');
const config = require('../utils/config');
const dynamoUtils = require('../../lambda/utils/DynamoUtils');
const configUtils = require('../../lambda/utils/ConfigUtils');
const dynamoStateTableMocker = require('../utils/DynamoStateTableMocker');
const integrationEcho = require('../../lambda/integration/IntegrationEcho');

var contactId = 'test-contact-id';

/**
 * IntegrationEcho tests
 */
describe('IntegrationEchoTests', function()
{
this.beforeAll(function()
  {
    config.loadEnv();
    dynamoStateTableMocker.setupMockDynamo(AWSMock, dynamoUtils);
  });

  this.afterAll(function()
  {
    AWSMock.restore('DynamoDB');
  });

  // Tests the integration handler
  it('IntegrationEcho.handler() vanilla', async function()
  {
    var state = buildState({});

    dynamoStateTableMocker.injectState(contactId, state);

    var event = {
      ContactId: contactId,
      OriginalRequest: JSON.stringify(buildEvent({})),
      Payload: '{"Hello": "Integration World"}'
    };

    // Run the Lambda
    await integrationEcho.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.IntegrationStatus).to.equal('DONE');
    expect(newState.customer.echoResult.Hello).to.equal('Integration World');
  });

  // Tests the integration handler with a sleep and an error
  it('IntegrationEcho.handler() sleep forced error', async function()
  {
    var state = buildState({});

    dynamoStateTableMocker.injectState(contactId, state);

    var event = {
      ContactId: contactId,
      OriginalRequest: JSON.stringify(buildEvent({})),
      Payload: '{"Hello": "Integration World", "SleepTime": "0.005", "ForcedError": "This is the failure reason"}'
    };

    // Run the Lambda
    await integrationEcho.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    console.info(JSON.stringify(newState, null, 2));

    // Assert new state
    expect(newState.IntegrationStatus).to.equal('ERROR');
    expect(newState.customer).to.equal(undefined);
    expect(newState.IntegrationErrorCause).to.equal('This is the failure reason');
  });

  // Tests non-json input
  it('IntegrationEcho.handler() non-JSON input', async function()
  {
    var state = buildState({});

    dynamoStateTableMocker.injectState(contactId, state);

    var event = {
      ContactId: contactId,
      OriginalRequest: JSON.stringify(buildEvent({})),
      Payload: '{ hello }'
    };

    // Run the Lambda
    await integrationEcho.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    console.info(JSON.stringify(newState, null, 2));

    // Assert new state
    expect(newState.IntegrationStatus).to.equal('DONE');
    expect(newState.customer.echoResult).to.equal('{ hello }');
  });

  // Tests invalid event
  it('IntegrationEcho.handler() non-JSON input', async function()
  {
    var state = buildState({});

    dynamoStateTableMocker.injectState(contactId, state);

    var event = {
      ContactId: undefined,
      OriginalRequest: JSON.stringify(buildEvent({})),
      Payload: undefined
    };

    // Run the Lambda
    try
    {
      await integrationEcho.handler(event, {});
      throw new Error('Should not succeed with missing ContactId');
    }
    catch (error)
    {
      expect(error.message).to.equal('Required field is missing: ContactId');
    }

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.IntegrationStatus).to.equal(undefined);
  });

});

/**
 * Builds an event
 */
function buildEvent(params)
{
  var event = {
    Details:
    {
      ContactData:
      {
        InitialContactId: contactId
      },
      Parameters:
      {
        ...params
      }
    }
  };

  return event;
}

/**
 * Builds a basic state
 */
function buildState(overrides)
{
  var state =
  {
    ContactId: contactId,
    System: {},
    CurrentRule_ruleType: 'Integration',
    CurrentRule_ruleType: 'Integration',
    CurrentRule_functionOutputKey: 'customer.echoResult',
    CurrentRule_lambdaFunctionArn: 'arn: ... stuff ... echo',
    ...overrides
  };

  return state;
}
