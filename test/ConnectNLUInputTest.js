// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const rewire = require('rewire');
const sinon = require('sinon');
const expect = require('chai').expect;
const AWSMock = require('aws-sdk-mock');
const config = require('./utils/config');
const connectNLUInput = rewire('../lambda/ConnectNLUInput');
const dynamoStateTableMocker = require('./utils/DynamoStateTableMocker');
const dynamoUtils = require('../lambda/utils/DynamoUtils');
const configUtils = require('../lambda/utils/ConfigUtils');
const keepWarmUtils = require('../lambda/utils/KeepWarmUtils');

const contactId = 'test-contact-id';

/**
 * ConnectNLUInput tests
 */
describe('ConnectNLUInputTests', function()
{
  this.beforeAll(function()
  {
    config.loadEnv();
    AWSMock.restore();
    // Mock state loading and saving
    dynamoStateTableMocker.setupMockDynamo(AWSMock, dynamoUtils);

    var getLexBots = sinon.fake.returns([
      {
        "Name": "unittesting-rules-engine-yesno",
        "SimpleName": "yesno",
        "Arn": "arn:aws:lex:ap-southeast-2:55555555:bot-alias/A9EYOXQ8TT/E8SEC9JHLP",
        "Id": "A9EYOXQ8TT",
        "LocaleId": "en_AU",
        "AliasId": "E8SEC9JHLP"
      }
    ]);

    sinon.replace(configUtils, 'getLexBots', getLexBots);
  });

  this.afterAll(function()
  {
    AWSMock.restore('DynamoDB');
    sinon.restore();
  });

  // Auto confirmation that accepts and renders ssml
  it('ConnectNLUInput.handler() auto confirm success ssml', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'true',
      CurrentRule_errorCount: 'Invalid',
      CurrentRule_inputCount: 'Invalid',
      CurrentRule_autoConfirmConfidence: 'Invalid',
      CurrentRule_autoConfirmMessage: '<speak>You said {{SMEH}}.</speak>',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'intentdata',
      slotValue: '2017-09-25',
      intentConfidence: '1.0'
    });

    // Run the Lambda
    await connectNLUInput.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('true');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('true');
    expect(newState.CurrentRule_slotValue).to.equal('2017-09-25');
    expect(newState.System.LastNLUInputSlot).to.equal('2017-09-25');
    expect(newState.SMEH).to.equal('2017-09-25');
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal('<speak>You said 2017-09-25.</speak>');
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal('ssml');
  });

  // Auto confirmation that accepts and renders text
  it('ConnectNLUInput.handler() auto confirm success text', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'true',
      CurrentRule_errorCount: 'Invalid',
      CurrentRule_inputCount: 'Invalid',
      CurrentRule_autoConfirmConfidence: 'Invalid',
      CurrentRule_autoConfirmMessage: 'You said {{SMEH}}.',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'intentdata',
      slotValue: '2017-09-25',
      intentConfidence: '1.0'
    });

    // Run the Lambda
    await connectNLUInput.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('true');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('true');
    expect(newState.CurrentRule_slotValue).to.equal('2017-09-25');
    expect(newState.System.LastNLUInputSlot).to.equal('2017-09-25');
    expect(newState.SMEH).to.equal('2017-09-25');
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal('You said 2017-09-25.');
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal('text');
  });

  // Auto confirmation that needs manual confirmation
  it('ConnectNLUInput.handler() auto confirm manual confirmation', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'true',
      CurrentRule_autoConfirmConfidence: '1.0',
      CurrentRule_confirmationMessage: '<speak>You said {{SMEH}} is that correct?</speak>',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'intentdata',
      slotValue: '2017-09-25',
      intentConfidence: '0.9'
    });

    // Run the Lambda
    await connectNLUInput.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('true');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('false');
    expect(newState.CurrentRule_slotValue).to.equal('2017-09-25');
    expect(newState.System.LastNLUInputSlot).to.equal('2017-09-25');
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal('<speak>You said 2017-09-25 is that correct?</speak>');
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal('ssml');
  });

  // Manual confirmation
  it('ConnectNLUInput.handler() manual confirmation', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'false',
      CurrentRule_autoConfirmConfidence: '0.5'
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'intentdata',
      slotValue: '2017-09-25',
      intentConfidence: '1.0'
    });

    // Run the Lambda
    await connectNLUInput.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('true');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('false');
    expect(newState.CurrentRule_slotValue).to.equal('2017-09-25');
    expect(newState.System.LastNLUInputSlot).to.equal('2017-09-25');
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal('You said 2017-09-25 is that correct?');
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal('text');
  });

  // noinput NLU match with no input rule set name
  it('ConnectNLUInput.handler() no input with a no input rule set name', async function()
  {
    var state = buildState({
      CurrentRule_noInputRuleSetName: 'No input ruleset'
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'nodata',
      slotValue: '',
      intentConfidence: '0.2'
    });

    // Run the Lambda
    await connectNLUInput.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('false');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.NextRuleSet).to.equal('No input ruleset');
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal(undefined);
    expect(newState.CurrentRule_errorCount).to.equal('0');
    expect(newState.CurrentRule_autoConfirmNow).to.equal(undefined);
    expect(newState.CurrentRule_slotValue).to.equal(undefined);
    expect(newState.System.LastNLUInputSlot).to.equal(undefined);
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal(undefined);
  });

  // First error hitting fallback
  it('ConnectNLUInput.handler() first error hitting fallback', async function()
  {
    var state = buildState({});

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'fallback',
      slotValue: '',
      intentConfidence: ''
    });

    // Run the Lambda
    await connectNLUInput.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('false');
    expect(newState.CurrentRule_done).to.equal('false');
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal(undefined);
    expect(newState.CurrentRule_errorMessage).to.equal('This is the first error message');
    expect(newState.CurrentRule_errorCount).to.equal('1');
    expect(newState.CurrentRule_slotValue).to.equal(undefined);
    expect(newState.System.LastNLUInputSlot).to.equal(undefined);
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal(undefined);
  });

  // Missing yes no lex bot
  it('ConnectNLUInput.handler() missing yes no bot', async function()
  {

    sinon.restore();

    var getLexBots = sinon.fake.returns([]);

    sinon.replace(configUtils, 'getLexBots', getLexBots);

    var state = buildState({});

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'intentdata',
      slotValue: '2017-09-25',
      intentConfidence: '0.9'
    });

    // Run the Lambda
    try
    {
      await connectNLUInput.handler(event, {});
      throw new Error('Expected failure due to missing yes no bot');
    }
    catch (error)
    {
      expect(error.message).to.equal(contactId + ' failed to locate yes no bot: unittesting-rules-engine-yesno');
    }
  });

  // Max attempts reached no error rule set
  it('ConnectNLUInput.handler() max attempts no error rule set', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'true',
      CurrentRule_autoConfirmConfidence: '1.0',
      CurrentRule_errorCount: '2',
      CurrentRule_errorRuleSetName: undefined
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'FallbackIntent',
      slotValue: '',
      intentConfidence: ''
    });

    // Run the Lambda
    await connectNLUInput.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.CurrentRule_terminate).to.equal('true');
    expect(newState.CurrentRule_validInput).to.equal('false');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.CurrentRule_autoConfirmNow).to.equal(undefined);
    expect(newState.CurrentRule_slotValue).to.equal(undefined);
    expect(newState.System.LastNLUInputSlot).to.equal(undefined);
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.NextRuleSet).to.equal(undefined);
    expect(newState.CurrentRule_errorMessage).to.equal('<speak>This is the third error message</speak>');
    expect(newState.CurrentRule_errorMessageType).to.equal('ssml');
  });

  // Max attempts reached
  it('ConnectNLUInput.handler() max attempts error rule set', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'true',
      CurrentRule_autoConfirmConfidence: '1.0',
      CurrentRule_errorCount: '2'
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'FallbackIntent',
      slotValue: '',
      intentConfidence: ''
    });

    // Run the Lambda
    await connectNLUInput.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('false');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.CurrentRule_autoConfirmNow).to.equal(undefined);
    expect(newState.CurrentRule_slotValue).to.equal(undefined);
    expect(newState.System.LastNLUInputSlot).to.equal(undefined);
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.NextRuleSet).to.equal('No match ruleset');
    expect(newState.CurrentRule_errorMessage).to.equal('<speak>This is the third error message</speak>');
    expect(newState.CurrentRule_errorMessageType).to.equal('ssml');
  });

  // Keep warm test
  it('ConnectNLUInput.handler() keep warm', async function()
  {
    var event = keepWarmUtils.createKeepWarmRequest('connectnluinput', 'some arn');
    var response = await connectNLUInput.handler(event, {});
    expect(keepWarmUtils.isKeepWarmResponse(response)).to.equal(true);
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
    CurrentRule_ruleType: 'NLUInput',
    CurrentRule_offerMessage: 'This is the offer message',
    CurrentRule_confirmationMessage: 'You said {{SMEH}} is that correct?',
    CurrentRule_autoConfirm: 'false',
    CurrentRule_autoConfirmMessage: 'You said {{SMEH}}.',
    CurrentRule_autoConfirmConfidence: '1.0',
    CurrentRule_outputStateKey: 'SMEH',
    CurrentRule_errorMessage1: 'This is the first error message',
    CurrentRule_errorMessage1Type: 'text',
    CurrentRule_errorMessage2: 'This is the second error message',
    CurrentRule_errorMessage2Type: 'text',
    CurrentRule_errorMessage3: '<speak>This is the third error message</speak>',
    CurrentRule_errorMessage3Type: 'ssml',
    CurrentRule_inputCount: '3',
    CurrentRule_errorCount: '0',
    CurrentRule_errorRuleSetName: 'No match ruleset',
    CurrentRule_dataType: 'date',
    ...overrides
  };

  return state;
}

