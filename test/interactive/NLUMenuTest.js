
var rewire = require('rewire');
const expect = require('chai').expect;
const AWSMock = require('aws-sdk-mock');
const interactiveConfig = require('./InteractiveConfig.js');
const lexRuntimeV2Mocker = require('../utils/LexRuntimeV2Mocker.js');
const dynamoTableMocker = require('../utils/DynamoTableDataMocker.js');
const dynamoUtils = require('../../lambda/utils/DynamoUtils.js');
const lexUtils = require('../../lambda/utils/LexUtils.js');

const nluMenuInteractive = rewire('../../lambda/interactive/NLUMenu.js');

/**
 * Interactive tests for NLUMenu
 */
describe('NLUMenuTests', function()
{
  this.beforeAll(function () {
    interactiveConfig.loadEnv();

    // Mock config loads
    dynamoTableMocker.setupMockDynamo(AWSMock, dynamoUtils);

    // Mock lex bot interactions
    lexRuntimeV2Mocker.setupMockLexRuntimeV2(AWSMock, lexUtils);
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
  });

  /**
   * Test what happens when a user enters 'Technical support' in the input phase
   */
  it('NLUMenu.input() "Technical support" should succeed', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'Technical support';

    context.customerState.CurrentRule_phase = 'input';

    var response = await nluMenuInteractive.input(context);

    expect(response.message).to.equal('Is that about a technical support enquiry?');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('CurrentRule_intent')).to.equal(true);
    expect(context.customerState.CurrentRule_intent).to.equal('TechnicalSupport');
    expect(context.stateToSave.has('CurrentRule_intentRuleSet')).to.equal(true);
    expect(context.customerState.CurrentRule_intentRuleSet).to.equal('Awesome Tech Support ruleset');
    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

  });

  /**
   * Test what happens when a user enters 'Technical support' in the input phase
   */
  it('NLUMenu.input(auto) "Technical support" should succeed', async function() {

    var context = makeAutoConfirmTestContext();

    context.requestMessage.input = 'Technical support';

    context.customerState.CurrentRule_phase = 'input';

    var response = await nluMenuInteractive.input(context);

    expect(response.message).to.equal('Thanks!');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(5);

    expect(context.stateToSave.has(context.customerState.CurrentRule_intentOutputKey)).to.equal(true);
    expect(context.customerState[context.customerState.CurrentRule_intentOutputKey]).to.equal('TechnicalSupport');
    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Awesome Tech Support ruleset');
    expect(context.stateToSave.has('CurrentRule_intent')).to.equal(true);
    expect(context.customerState.CurrentRule_intent).to.equal('TechnicalSupport');
    expect(context.stateToSave.has('CurrentRule_intentRuleSet')).to.equal(true);
    expect(context.customerState.CurrentRule_intentRuleSet).to.equal('Awesome Tech Support ruleset');
    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

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

    expect(response.message).to.equal('You can say things like oranges, apples or pears');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

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

    expect(response.message).to.equal('Why don\'t we try using your keypad?');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('2');
    expect(context.stateToSave.has('SomeErrorKey')).to.equal(true);
    expect(context.customerState.SomeErrorKey).to.equal('true');

  });

  /**
   * Test what happens when a user enters Yes in the confirmation phase
   */
  it('NLUMenu.confirm() "Yes" should succeed', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'Yes';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_intent = 'TechnicalSupport';
    context.customerState.CurrentRule_intentRuleSet = 'Awesome Tech Support ruleset';

    var response = await nluMenuInteractive.confirm(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Awesome Tech Support ruleset');
    expect(context.stateToSave.has('SelectedIntent')).to.equal(true);
    expect(context.customerState.SelectedIntent).to.equal('TechnicalSupport');
  });

  /**
   * Test what happens when a user enters No in the confirmation phase
   * with an error count of 0
   */
  it('NLUMenu.confirm() "No", errorCount: 0, should succeed', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'No';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_intent = 'TechnicalSupport';
    context.customerState.CurrentRule_intentRuleSet = 'Awesome Tech Support ruleset';

    var response = await nluMenuInteractive.confirm(context);

    expect(response.message).to.equal('In a few words tell me how I can help you today?');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(4);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('input');

    expect(context.stateToSave.has('CurrentRule_intent')).to.equal(true);
    expect(context.customerState.CurrentRule_intent).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_intentRuleSet')).to.equal(true);
    expect(context.customerState.CurrentRule_intentRuleSet).to.equal(undefined);
  });

  /**
   * Test what happens when a user enters No in the confirmation phase
   * with an error count of 1
   */
  it('NLUMenu.confirm() "No", errorCount: 1, should succeed', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'No';
    context.customerState.CurrentRule_errorCount = '1';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_intent = 'TechnicalSupport';
    context.customerState.CurrentRule_intentRuleSet = 'Awesome Tech Support ruleset';

    var response = await nluMenuInteractive.confirm(context);

    expect(response.message).to.equal('Why don\'t we try using your keypad?');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My NLUMenu rule');
    expect(response.ruleType).to.equal('NLUMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('2');

    expect(context.stateToSave.has('SomeErrorKey')).to.equal(true);
    expect(context.customerState.SomeErrorKey).to.equal('true');

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

      fail('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu.execute() missing required config');
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

      fail('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu.input() missing required config');
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

      fail('NLUMenu should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu.confirm() missing required config');
    }
  });

  /**
   * Test what happens when an invalid lex bot is specified
   */
  it('NLUMenu.findLexBot() should fail for invalid lex bot name', async function()
  {
    try
    {
      var lexBot = await nluMenuInteractive.findLexBot('somerubbishname');

      fail('NLUMenu should fail to find invalid lex bots');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUMenu.findLexBot() could not find Lex bot: somerubbishname');
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
        offerMessage: 'In a few words tell me how I can help you today? XXX',
        lexBotName: 'intent XXX',
        intentOutputKey: 'SelectedIntent XXX',
        intentRuleSet_TechnicalSupport: 'Awesome Tech Support ruleset XXX',
        intentConfirmationMessage_TechnicalSupport: 'Is that about a technical support enquiry? XXX',
        errorMessage1: 'You can say things like oranges, apples or pears. XXX',
        errorMessage2: 'Why don\'t we try using your keypad? XXX',
        errorOutputKey: 'SomeErrorKey XXX'
      }
    },
    customerState: {
      Customer: {
        FirstName: 'Jeeves'
      },
      CurrentRule_errorCount: '0',
      CurrentRule_lexBotName: 'intent',
      CurrentRule_intentOutputKey: 'SelectedIntent',
      CurrentRule_offerMessage: 'In a few words tell me how I can help you today?',
      CurrentRule_intentRuleSet_TechnicalSupport: 'Awesome Tech Support ruleset',
      CurrentRule_intentConfirmationMessage_TechnicalSupport: 'Is that about a technical support enquiry?',
      CurrentRule_errorMessage1: 'You can say things like oranges, apples or pears',
      CurrentRule_errorMessage2: 'Why don\'t we try using your keypad?',
      CurrentRule_errorOutputKey: 'SomeErrorKey'
    },
    stateToSave: new Set()
  };
}

/**
 * Makes an auto confirm test context
 */
function makeAutoConfirmTestContext()
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
        offerMessage: 'In a few words tell me how I can help you today? XXX',
        lexBotName: 'intent XXX',
        intentOutputKey: 'SelectedIntent XXX',
        intentRuleSet_TechnicalSupport: 'Awesome Tech Support ruleset XXX',
        intentConfirmationMessage_TechnicalSupport: 'Is that about a technical support enquiry? XXX',
        errorMessage1: 'You can say things like oranges, apples or pears. XXX',
        errorMessage2: 'Why don\'t we try using your keypad? XXX',
        errorOutputKey: 'SomeErrorKey XXX',
        alwaysConfirm: 'false XXX',
        autoConfirmMessage: 'Thanks! XXX'
      }
    },
    customerState: {
      Customer: {
        FirstName: 'Jeeves'
      },
      CurrentRule_errorCount: '0',
      CurrentRule_lexBotName: 'intent',
      CurrentRule_intentOutputKey: 'SelectedIntent',
      CurrentRule_offerMessage: 'In a few words tell me how I can help you today?',
      CurrentRule_intentRuleSet_TechnicalSupport: 'Awesome Tech Support ruleset',
      CurrentRule_intentConfirmationMessage_TechnicalSupport: 'Is that about a technical support enquiry?',
      CurrentRule_errorMessage1: 'You can say things like oranges, apples or pears',
      CurrentRule_errorMessage2: 'Why don\'t we try using your keypad?',
      CurrentRule_errorOutputKey: 'SomeErrorKey',
      CurrentRule_alwaysConfirm: 'false',
      CurrentRule_autoConfirmMessage: 'Thanks!'
    },
    stateToSave: new Set()
  };
}
