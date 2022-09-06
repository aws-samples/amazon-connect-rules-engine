// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const rewire = require('rewire');
const sinon = require('sinon');
const expect = require('chai').expect;
const AWSMock = require('aws-sdk-mock');
const config = require('./utils/config');
const connectNLUMenu = rewire('../lambda/ConnectNLUMenu');
const dynamoStateTableMocker = require('./utils/DynamoStateTableMocker');
const dynamoUtils = require('../lambda/utils/DynamoUtils');
const configUtils = require('../lambda/utils/ConfigUtils');
const keepWarmUtils = require('../lambda/utils/KeepWarmUtils');

const contactId = 'test-contact-id';

/**
 * ConnectNLUMenu tests
 */
describe('ConnectNLUMenuTests', function()
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
  it('ConnectNLUMenu.handler() auto confirm success ssml', async function()
  {

    var state = buildState({
      CurrentRule_autoConfirm: 'true',
      CurrentRule_autoConfirmConfidence: '0.75',
      CurrentRule_autoConfirmMessage: '<speak>You said {{SMEH}}.</speak>',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'TechnicalSupport',
      intentConfidence: '0.92'
    });


    var response = await connectNLUMenu.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.NextRuleSet).to.equal('Technical support menu');
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('true');
    expect(newState.CurrentRule_errorCount).to.equal('0');
    expect(newState.CurrentRule_matchedIntent).to.equal('TechnicalSupport');
    expect(newState.CurrentRule_matchedIntentConfidence).to.equal('0.92');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('true');
    expect(newState.CurrentRule_confirmationRequired).to.equal('false');
    expect(newState.System.LastNLUMenuIntent).to.equal('TechnicalSupport');
    expect(newState.SMEH).to.equal('TechnicalSupport');
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal('<speak>You said TechnicalSupport.</speak>');
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal('ssml');
    expect(newState.CurrentRule_errorMessage).to.equal(undefined);
    expect(newState.CurrentRule_errorMessageType).to.equal('none');
  });

  // Auto confirmation that accepts and renders text
  it('ConnectNLUMenu.handler() auto confirm success text', async function()
  {

    var state = buildState({
      CurrentRule_autoConfirm: 'true',
      CurrentRule_autoConfirmConfidence: '0.75',
      CurrentRule_autoConfirmMessage: 'You said {{SMEH}}. Funky.',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'TechnicalSupport',
      intentConfidence: '0.92'
    });


    var response = await connectNLUMenu.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.NextRuleSet).to.equal('Technical support menu');
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('true');
    expect(newState.CurrentRule_errorCount).to.equal('0');
    expect(newState.CurrentRule_matchedIntent).to.equal('TechnicalSupport');
    expect(newState.CurrentRule_matchedIntentConfidence).to.equal('0.92');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('true');
    expect(newState.CurrentRule_confirmationRequired).to.equal('false');
    expect(newState.System.LastNLUMenuIntent).to.equal('TechnicalSupport');
    expect(newState.SMEH).to.equal('TechnicalSupport');
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal('You said TechnicalSupport. Funky.');
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal('text');
    expect(newState.CurrentRule_errorMessage).to.equal(undefined);
    expect(newState.CurrentRule_errorMessageType).to.equal('none');
  });

  // Auto confirmation that doesn't meet threshold
  it('ConnectNLUMenu.handler() auto confirm below theshold', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'true',
      CurrentRule_autoConfirmConfidence: '0.9',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'TechnicalSupport',
      intentConfidence: '0.89'
    });

    var response = await connectNLUMenu.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.NextRuleSet).to.equal(undefined);
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('true');
    expect(newState.CurrentRule_errorCount).to.equal('0');
    expect(newState.CurrentRule_matchedIntent).to.equal('TechnicalSupport');
    expect(newState.CurrentRule_matchedIntentConfidence).to.equal('0.89');
    expect(newState.CurrentRule_done).to.equal('false');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('false');
    expect(newState.CurrentRule_confirmationRequired).to.equal('true');
    expect(newState.System.LastNLUMenuIntent).to.equal(undefined);
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal('That is about technical support, is that right?');
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal('text');
    expect(newState.CurrentRule_errorMessage).to.equal(undefined);
    expect(newState.CurrentRule_errorMessageType).to.equal('none');
    expect(newState.CurrentRule_yesNoBotArn).to.equal('arn:aws:lex:ap-southeast-2:55555555:bot-alias/A9EYOXQ8TT/E8SEC9JHLP');
  });

  // Manual confirmation
  it('ConnectNLUMenu.handler() manual confirm', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'false',
      CurrentRule_autoConfirmConfidence: '0.5',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'TechnicalSupport',
      intentConfidence: '0.87'
    });

    var response = await connectNLUMenu.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.NextRuleSet).to.equal(undefined);
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('true');
    expect(newState.CurrentRule_errorCount).to.equal('0');
    expect(newState.CurrentRule_matchedIntent).to.equal('TechnicalSupport');
    expect(newState.CurrentRule_matchedIntentConfidence).to.equal('0.87');
    expect(newState.CurrentRule_done).to.equal('false');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('false');
    expect(newState.CurrentRule_confirmationRequired).to.equal('true');
    expect(newState.System.LastNLUMenuIntent).to.equal(undefined);
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal('That is about technical support, is that right?');
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal('text');
    expect(newState.CurrentRule_errorMessage).to.equal(undefined);
    expect(newState.CurrentRule_errorMessageType).to.equal('none');
    expect(newState.CurrentRule_yesNoBotArn).to.equal('arn:aws:lex:ap-southeast-2:55555555:bot-alias/A9EYOXQ8TT/E8SEC9JHLP');
  });

  // Manual confirmation SSML
  it('ConnectNLUMenu.handler() manual confirm ssml', async function()
  {
    // Test numerical defaults
    var state = buildState({
      CurrentRule_autoConfirm: 'false',
      CurrentRule_intentConfirmationMessage_TechnicalSupport: '<speak>Technical support huh? Tricksy!</speak>',
      CurrentRule_autoConfirmConfidence: undefined,
      CurrentRule_errorCount: '',
      CurrentRule_inputCount: 'test',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'TechnicalSupport',
      intentConfidence: '0.87'
    });

    var response = await connectNLUMenu.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.NextRuleSet).to.equal(undefined);
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('true');
    expect(newState.CurrentRule_errorCount).to.equal('');
    expect(newState.CurrentRule_matchedIntent).to.equal('TechnicalSupport');
    expect(newState.CurrentRule_matchedIntentConfidence).to.equal('0.87');
    expect(newState.CurrentRule_done).to.equal('false');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('false');
    expect(newState.CurrentRule_confirmationRequired).to.equal('true');
    expect(newState.System.LastNLUMenuIntent).to.equal(undefined);
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal('<speak>Technical support huh? Tricksy!</speak>');
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal('ssml');
    expect(newState.CurrentRule_errorMessage).to.equal(undefined);
    expect(newState.CurrentRule_errorMessageType).to.equal('none');
    expect(newState.CurrentRule_yesNoBotArn).to.equal('arn:aws:lex:ap-southeast-2:55555555:bot-alias/A9EYOXQ8TT/E8SEC9JHLP');
  });

  // Fallback first error
  it('ConnectNLUMenu.handler() fallback first error input count 3', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'false',
      CurrentRule_autoConfirmConfidence: '0.5',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'FallbackIntent',
      intentConfidence: ''
    });

    var response = await connectNLUMenu.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.NextRuleSet).to.equal(undefined);
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('false');
    expect(newState.CurrentRule_errorCount).to.equal('1');
    expect(newState.CurrentRule_matchedIntent).to.equal('FallbackIntent');
    expect(newState.CurrentRule_matchedIntentConfidence).to.equal('0');
    expect(newState.CurrentRule_done).to.equal('false');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('false');
    expect(newState.CurrentRule_confirmationRequired).to.equal('false');
    expect(newState.System.LastNLUMenuIntent).to.equal(undefined);
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal(undefined);
    expect(newState.CurrentRule_errorMessage).to.equal('This is the first error message');
    expect(newState.CurrentRule_errorMessageType).to.equal('text');
    expect(newState.CurrentRule_yesNoBotArn).to.equal(undefined);
  });

  // Fallback first error no yesno bot
  it('ConnectNLUMenu.handler() manual confirm no yesnobot', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'false',
      CurrentRule_autoConfirmConfidence: '0.5',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'TechnicalSupport',
      intentConfidence: '1.0'
    });

    sinon.restore();
    var getLexBots = sinon.fake.returns([]);
    sinon.replace(configUtils, 'getLexBots', getLexBots);

    try
    {
      await connectNLUMenu.handler(event, {});
      throw new Error('Was expecting failure due to missing yesno bot');
    }
    catch (error)
    {
      expect(error.message).to.equal('test-contact-id failed to locate yes no bot: unittesting-rules-engine-yesno');
    }
  });

  // Max errors reduced input count, no error rule set
  it('ConnectNLUMenu.handler() max errors reduced input count, no error rule set', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'false',
      CurrentRule_autoConfirmConfidence: '0.5',
      CurrentRule_errorRuleSetName: undefined,
      CurrentRule_errorCount: '1',
      CurrentRule_inputCount: '2',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'FallbackIntent',
      intentConfidence: ''
    });

    var response = await connectNLUMenu.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.NextRuleSet).to.equal(undefined);
    expect(newState.CurrentRule_terminate).to.equal('true');
    expect(newState.CurrentRule_validInput).to.equal('false');
    expect(newState.CurrentRule_errorCount).to.equal('2');
    expect(newState.CurrentRule_matchedIntent).to.equal('FallbackIntent');
    expect(newState.CurrentRule_matchedIntentConfidence).to.equal('0');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('false');
    expect(newState.CurrentRule_confirmationRequired).to.equal('false');
    expect(newState.System.LastNLUMenuIntent).to.equal(undefined);
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal(undefined);
    expect(newState.CurrentRule_errorMessage).to.equal('This is the second error message');
    expect(newState.CurrentRule_errorMessageType).to.equal('text');
    expect(newState.CurrentRule_yesNoBotArn).to.equal(undefined);
  });

  // Max errors reduced input count, with error rule set
  it('ConnectNLUMenu.handler() max errors reduced input count, with error rule set', async function()
  {
    var state = buildState({
      CurrentRule_autoConfirm: 'false',
      CurrentRule_autoConfirmConfidence: '0.5',
      CurrentRule_errorCount: '0',
      CurrentRule_inputCount: '1',
    });

    dynamoStateTableMocker.injectState(contactId, state);

    var event = buildEvent({
      matchedIntent: 'FallbackIntent',
      intentConfidence: ''
    });

    var response = await connectNLUMenu.handler(event, {});

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.NextRuleSet).to.equal('Error ruleset');
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('false');
    expect(newState.CurrentRule_errorCount).to.equal('1');
    expect(newState.CurrentRule_matchedIntent).to.equal('FallbackIntent');
    expect(newState.CurrentRule_matchedIntentConfidence).to.equal('0');
    expect(newState.CurrentRule_done).to.equal('true');
    expect(newState.CurrentRule_autoConfirmNow).to.equal('false');
    expect(newState.CurrentRule_confirmationRequired).to.equal('false');
    expect(newState.System.LastNLUMenuIntent).to.equal(undefined);
    expect(newState.SMEH).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinal).to.equal(undefined);
    expect(newState.CurrentRule_confirmationMessageFinalType).to.equal(undefined);
    expect(newState.CurrentRule_errorMessage).to.equal('This is the first error message');
    expect(newState.CurrentRule_errorMessageType).to.equal('text');
    expect(newState.CurrentRule_yesNoBotArn).to.equal(undefined);
  });


  // Keep warm test
  it('ConnectNLUMenu.handler() keep warm', async function()
  {
    var event = keepWarmUtils.createKeepWarmRequest('connectnlumenu', 'some arn');
    var response = await connectNLUMenu.handler(event, {});
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
    CurrentRule_ruleType: 'NLUMenu',
    CurrentRule_offerMessage: 'This is the offer message',
    CurrentRule_autoConfirm: 'false',
    CurrentRule_autoConfirmMessage: 'You said {{SMEH}}.',
    CurrentRule_autoConfirmConfidence: '1.0',
    CurrentRule_outputStateKey: 'SMEH',
    CurrentRule_intentRuleSet_TechnicalSupport: 'Technical support menu',
    CurrentRule_intentConfirmationMessage_TechnicalSupport: 'That is about technical support, is that right?',
    CurrentRule_intentRuleSet_Sales: 'Sales menu',
    CurrentRule_intentConfirmationMessage_Sales: 'Thats about sales, is that right?',
    CurrentRule_errorMessage1: 'This is the first error message',
    CurrentRule_errorMessage1Type: 'text',
    CurrentRule_errorMessage2: 'This is the second error message',
    CurrentRule_errorMessage2Type: 'text',
    CurrentRule_errorMessage3: '<speak>This is the third error message</speak>',
    CurrentRule_errorMessage3Type: 'ssml',
    CurrentRule_inputCount: '3',
    CurrentRule_errorCount: '0',
    CurrentRule_errorRuleSetName: 'Error ruleset',
    ...overrides
  };

  return state;
}


