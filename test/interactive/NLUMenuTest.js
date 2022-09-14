// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const expect = require('chai').expect;
const sinon = require('sinon');
const AWSMock = require('aws-sdk-mock');
const interactiveConfig = require('./InteractiveConfig');
const lexRuntimeV2Mocker = require('../utils/LexRuntimeV2Mocker');
const nluMenuInteractive = require('../../lambda/interactive/NLUMenu');
const configUtils = require('../../lambda/utils/ConfigUtils');
const lexUtils = require('../../lambda/utils/LexUtils');

/**
 * Interactive tests for NLUMenu
 */
describe('NLUMenuTests', function()
{
  this.beforeAll(function ()
  {
    interactiveConfig.loadEnv();

    // Mock lex bot interactions
    lexRuntimeV2Mocker.setupMockLexRuntimeV2(AWSMock, lexUtils);

    var getLexBots = sinon.fake.returns([
      {
        "Name": "unittesting-rules-engine-intent",
        "SimpleName": "intent",
        "Arn": "arn:aws:lex:ap-southeast-2:55555555:bot-alias/A9EYOXQ8FF/E8SEC9JHHC",
        "Id": "A9EYOXQ8FF",
        "LocaleId": "en_AU",
        "AliasId": "E8SEC9JHHC"
      },
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
    sinon.restore();
    AWSMock.restore('LexRuntimeV2');
  });

  /**
   * Test what happens with a vanilla execute
   */
  it('NLUMenu.execute() should succeed', async function() {

    var context = makeTestContext();

    var response = await nluMenuInteractive.execute(context);

    expect(response.message).to.equal('In a few words tell me how I can help you today?');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('input');
    expect(context.customerState.CurrentRule_errorCount).to.equal('0');
  });

  /**
   * Test what happens when a user enters 'Technical support' in the input phase
   */
  it('NLUMenu.input() "Technical support" should succeed', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'Technical support';
    context.customerState.CurrentRule_phase = 'input';

    var response = await nluMenuInteractive.input(context);

    expect(response.message).to.equal('That\'s about technical support, right?');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(4);

    expect(context.stateToSave.has('CurrentRule_matchedIntent')).to.equal(true);
    expect(context.customerState.CurrentRule_matchedIntent).to.equal('TechnicalSupport');
    expect(context.stateToSave.has('CurrentRule_matchedIntentRuleSet')).to.equal(true);
    expect(context.customerState.CurrentRule_matchedIntentRuleSet).to.equal('Technical support menu');
    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');
    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');
  });

  /**
   * Test what happens when a user enters 'Technical support' in the input phase
   */
  it('NLUMenu.input(auto) "Technical support" should succeed', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'Technical support';
    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_autoConfirm = 'true';

    var response = await nluMenuInteractive.input(context);

    expect(response.message).to.equal('Thanks!');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(7);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Technical support menu');
    expect(context.stateToSave.has('CurrentRule_matchedIntent')).to.equal(true);
    expect(context.customerState.CurrentRule_matchedIntent).to.equal('TechnicalSupport');
    expect(context.stateToSave.has('CurrentRule_matchedIntentConfidence')).to.equal(true);
    expect(context.customerState.CurrentRule_matchedIntentConfidence).to.equal('0.8');
    expect(context.stateToSave.has('CurrentRule_matchedIntentRuleSet')).to.equal(true);
    expect(context.customerState.CurrentRule_matchedIntentRuleSet).to.equal('Technical support menu');
    expect(context.stateToSave.has('Customer')).to.equal(true);
    expect(context.customerState.Customer.Intent).to.equal('TechnicalSupport');
    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUMenuIntent).to.equal('TechnicalSupport');
    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');
  });

  /**
   * Test what happens when a user enters jibberish in the input phase
   * with an existing error count of 0
   */
  it('NLUMenu.input() "Jibberish", errorCount: 0 should succeed', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'Some random jibberish';

    context.customerState.CurrentRule_phase = 'input';

    var response = await nluMenuInteractive.input(context);

    expect(response.message).to.equal('You can say things like sales, service or support.\nIn a few words tell me how I can help you today?');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

  });

  /**
   * Test what happens when a user enters jibberish in the input phase
   * with an existing error count of 1
   */
  it('NLUMenu.input() "Jibberish", errorCount: 1 should succeed', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'Some random jibberish';

    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_errorCount = '1';

    var response = await nluMenuInteractive.input(context);

    expect(response.message).to.equal('Tell me how we can help, you can say things like sales or support.\nIn a few words tell me how I can help you today?');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('2');

  });

  /**
   * Test what happens when a user enters jibberish in the input phase
   * with an existing error count of 2 checking for fall through
   */
  it('NLUMenu.input() "Jibberish", errorCount: 2 should succeed and fall through', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'Some random jibberish';

    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_errorRuleSetName = '';

    var response = await nluMenuInteractive.input(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.terminate).to.equal(undefined);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');
  });

  /**
   * Test what happens when a user enters jibberish in the input phase
   * with an existing error count of 2
   */
  it('NLUMenu.input() "Jibberish", errorCount: 2 should succeed and go to error rule set', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'Some random jibberish';

    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_errorRuleSetName = 'Some error ruleset';

    var response = await nluMenuInteractive.input(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.terminate).to.equal(undefined);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');
    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Some error ruleset');
  });

  /**
   * Test what happens when a user enters NOINPUT in the input phase
   * with an existing error count of 0
   */
  it('NLUMenu.input() "NOINPUT", errorCount: 0 should reprompt', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'NOINPUT';

    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_errorCount = '0';

    var response = await nluMenuInteractive.input(context);

    expect(response.message).to.equal('You can say things like sales, service or support.\nIn a few words tell me how I can help you today?');
    expect(response.inputRequired).to.equal(true);
    expect(response.terminate).to.equal(undefined);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');
  });

  /**
   * Test what happens when a user enters Yes in the confirmation phase
   */
  it('NLUMenu.confirm() "Yes" should succeed', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'Yes';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_matchedIntent = 'TechnicalSupport';
    context.customerState.CurrentRule_matchedIntentRuleSet = 'Awesome Tech Support ruleset';

    var response = await nluMenuInteractive.confirm(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('Customer')).to.equal(true);
    expect(context.customerState.Customer.Intent).to.equal('TechnicalSupport');

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUMenuIntent).to.equal('TechnicalSupport');

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Awesome Tech Support ruleset');
  });

  /**
   * Test what happens when a user enters No in the confirmation phase
   * with an error count of 0
   */
  it('NLUMenu.confirm() "No", errorCount: 0, should succeed', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'No';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_matchedIntent = 'TechnicalSupport';
    context.customerState.CurrentRule_matchedIntentRuleSet = 'Awesome Tech Support ruleset';

    var response = await nluMenuInteractive.confirm(context);

    expect(response.message).to.equal('In a few words tell me how I can help you today?');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(5);

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('input');

    expect(context.stateToSave.has('CurrentRule_matchedIntent')).to.equal(true);
    expect(context.customerState.CurrentRule_matchedIntent).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_matchedIntentRuleSet')).to.equal(true);
    expect(context.customerState.CurrentRule_matchedIntentRuleSet).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');
  });

  /**
   * Test what happens when a user enters No in the confirmation phase
   * with an error count of 2, hang up
   */
  it('NLUMenu.confirm() "No", errorCount: 2, should hang up', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'No';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_errorRuleSetName = '';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_matchedIntent = 'TechnicalSupport';
    context.customerState.CurrentRule_matchedIntentRuleSet = 'Awesome Tech Support ruleset';

    var response = await nluMenuInteractive.confirm(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.terminate).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');
  });

  /**
   * Test what happens when a user enters No in the confirmation phase
   * with an error count of 2, error rule set
   */
  it('NLUMenu.confirm() "No", errorCount: 2, error rule set', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'No';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_errorRuleSetName = '';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_errorRuleSetName = 'My error rule set';
    context.customerState.CurrentRule_matchedIntent = 'TechnicalSupport';
    context.customerState.CurrentRule_matchedIntentRuleSet = 'Awesome Tech Support ruleset';

    var response = await nluMenuInteractive.confirm(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.terminate).to.equal(undefined);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('My error rule set');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');
  });

  /**
   * Test what happens with an missing input
   */
  it('NLUMenu.input() should fail for missing input', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '';

    try
    {
      var response = await nluMenuInteractive.input(context);

      throw new Error('NLUMenu should fail with missing input');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu is missing required input');
    }
  });

  /**
   * Test what happens with missing inputs
   */
  it('NLUMenu.confirm() should fail for missing inputs', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '';
    context.customerState.CurrentRule_matchedIntent = '';
    context.customerState.CurrentRule_matchedIntentRuleSet = '';

    try
    {
      var response = await nluMenuInteractive.confirm(context);

      throw new Error('NLUMenu should fail with missing input');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu missing required input or matched intent during confirm');
    }

    context.requestMessage.input = 'Technical support stuff';
    context.customerState.CurrentRule_matchedIntent = '';
    context.customerState.CurrentRule_matchedIntentRuleSet = '';

    try
    {
      var response = await nluMenuInteractive.confirm(context);

      throw new Error('NLUMenu should fail with missing input');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu missing required input or matched intent during confirm');
    }

    context.requestMessage.input = 'Technical support stuff';
    context.customerState.CurrentRule_matchedIntent = 'TechnicalSupport';
    context.customerState.CurrentRule_matchedIntentRuleSet = '';

    try
    {
      var response = await nluMenuInteractive.confirm(context);

      throw new Error('NLUMenu should fail with missing input');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu missing required input or matched intent during confirm');
    }

    context.requestMessage.input = 'Technical support stuff';
    context.customerState.CurrentRule_matchedIntent = 'TechnicalSupport';
    context.customerState.CurrentRule_matchedIntentRuleSet = 'Technica support menu';

    try
    {
      await nluMenuInteractive.confirm(context);
    }
    catch (error)
    {
      throw new Error('NLUMenu should not fail', error);
    }
  });


  /**
   * Test what happens with an invalid context
   */
  it('NLUMenu.execute() should fail for invalid context', async function() {

    var context = {
      requestMessage: {},
      customerState: {}
    };

    try
    {
      var response = await nluMenuInteractive.execute(context);

      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu has invalid configuration');
    }

    context = makeTestContext();

    context.customerState.CurrentRule_autoConfirm = 'true';
    context.customerState.CurrentRule_autoConfirmMessage = '';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu auto confirm is enabled but an auto confirm message was not provided');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_errorCount = 'foo';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu error count must be a number');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_inputCount = ' ';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu input count must be a number');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_autoConfirmConfidence = 'bletch';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu auto confirm confidence must be a number between 0.0 and 1.0');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_autoConfirmConfidence = '-1.0';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu auto confirm confidence must be a number between 0.0 and 1.0');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_inputCount = 'foo';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu input count must be a number');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_inputCount = '0';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu input count must be between 1 and 3');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_errorCount = 'foo';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu error count must be a number');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_errorCount = '-1';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu error count must be between 0 and 2');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_errorCount = '3';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu error count must be between 0 and 2');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_inputCount = '2';
    context.customerState.CurrentRule_errorMessage2 = '';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu is missing required error message 2');
    }

    context = makeTestContext();
    context.customerState.CurrentRule_inputCount = '3';
    context.customerState.CurrentRule_errorMessage3 = '';

    try
    {
      var response = await nluMenuInteractive.execute(context);
      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu is missing required error message 3');
    }

  });

  /**
   * Test what happens with an invalid context
   */
  it('NLUMenu.input() should fail for invalid context', async function()
  {
    var context = {
      requestMessage: {},
      customerState: {}
    };

    try
    {
      var response = await nluMenuInteractive.input(context);

      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu has invalid configuration');
    }
  });

  /**
   * Test what happens with an invalid context
   */
  it('NLUMenu.confirm() should fail for invalid context', async function()
  {
    var context = {
      requestMessage: {},
      customerState: {}
    };

    try
    {
      var response = await nluMenuInteractive.confirm(context);

      throw new Error('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu has invalid configuration');
    }
  });

});

/**
 * Makes a test context
 */
function makeTestContext()
{
  return {
    requestMessage: {
      contactId: 'test',
      generateVoice: false
    },
    currentRuleSet: {
      name: 'My test rule set'
    },
    currentRule: {
      name: 'My NLUMenu rule',
      type: 'NLUMenu',
      params: {
      }
    },
    customerState: {
      CurrentRule_offerMessage: 'In a few words tell me how I can help you today?',
      CurrentRule_errorCount: '0',
      CurrentRule_autoConfirm: 'false',
      CurrentRule_autoConfirmConfidence: '0.5',
      CurrentRule_autoConfirmMessage: 'Thanks!',
      CurrentRule_errorRuleSetName: 'Error ruleset',
      CurrentRule_lexBotName: 'intent',
      CurrentRule_inputCount: '3',
      CurrentRule_outputStateKey: 'Customer.Intent',
      CurrentRule_errorMessage1: 'You can say things like sales, service or support.',
      CurrentRule_errorMessage2: 'Tell me how we can help, you can say things like sales or support.',
      CurrentRule_errorMessage3: 'Sorry I couldn\'t understand you.',
      CurrentRule_intentRuleSet_Sales: 'Sales menu',
      CurrentRule_intentConfirmationMessage_Sales: 'That\'s about sales, right?',
      CurrentRule_intentRuleSet_TechnicalSupport: 'Technical support menu',
      CurrentRule_intentConfirmationMessage_TechnicalSupport: 'That\'s about technical support, right?',
      System: {}
    },
    stateToSave: new Set()
  };
}
