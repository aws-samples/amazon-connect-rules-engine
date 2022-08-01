// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const dtmfMenuInteractive = rewire('../../lambda/interactive/DTMFMenu.js');

/**
 * Interactive tests for DTMFMenu
 */
describe('DTMFMenuTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('DTMFMenu.execute() should succeed', async function()
  {
    var context = makeTestContext();

    var response = await dtmfMenuInteractive.execute(context);

    expect(response.message).to.equal('Press 1 for sales. 2 for tech support.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfmenu rule');
    expect(response.ruleType).to.equal('DTMFMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('input');
  });

  it('DTMFMenu.execute() should fail for invalid context', async function()
  {
    var context = {
    };

    try
    {
      var response = await dtmfMenuInteractive.execute(context);
      fail('UpdateState should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('DTMFMenu has invalid configuration');
    }
  });

  it('DTMFMenu.execute() should fail for invalid error config', async function()
  {
    var context = makeTestContext();

    context.customerState.CurrentRule_inputCount = '2';
    context.customerState.CurrentRule_errorMessage2 = undefined;
    context.customerState.CurrentRule_errorMessage3 = undefined;

    try
    {
      var response = await dtmfMenuInteractive.execute(context);
      fail('UpdateState should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('DTMFMenu is missing required error message 2');
    }
  });

  it('DTMFMenu.execute() should fail for invalid error config', async function()
  {
    var context = makeTestContext();

    context.customerState.CurrentRule_inputCount = '3';
    context.customerState.CurrentRule_errorMessage3 = undefined;

    try
    {
      var response = await dtmfMenuInteractive.execute(context);
      fail('UpdateState should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('DTMFMenu is missing required error message 3');
    }
  });

  it('DTMFMenu.input() input "1"', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = '1';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfMenuInteractive.input(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfmenu rule');
    expect(response.ruleType).to.equal('DTMFMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('User pressed 1');

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastSelectedDTMF).to.equal('1');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');
  });

  it('DTMFMenu.input() input "2"', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = '2';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfMenuInteractive.input(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfmenu rule');
    expect(response.ruleType).to.equal('DTMFMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('User pressed 2');

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastSelectedDTMF).to.equal('2');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');
  });

  it('DTMFMenu.input() input "9"', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = '9';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfMenuInteractive.input(context);

    expect(response.message).to.equal('Please select a valid option 1.\nPress 1 for sales. 2 for tech support.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfmenu rule');
    expect(response.ruleType).to.equal('DTMFMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
  });

  it('DTMFMenu.input() input "9" errorCount: "foo" with errorRuleSetName', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = '9';
    context.currentRule.params.errorCount = 'foo';
    context.customerState.CurrentRule_errorCount = 'foo';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfMenuInteractive.input(context);

    expect(response.message).to.equal('Please select a valid option 1.\nPress 1 for sales. 2 for tech support.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfmenu rule');
    expect(response.ruleType).to.equal('DTMFMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
  });

  it('DTMFMenu.input() undefined input', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = undefined;
    context.customerState.CurrentRule_phase = 'input';

    try
    {
      var response = await dtmfMenuInteractive.input(context);
      fail('UpdateState should fail with undefined input');
    }
    catch (error)
    {
      expect(error.message).to.equal('DTMFMenu.input() missing input');
    }
  });

  it('DTMFMenu.input() input "9" errorCount: 2 with errorRuleSetName', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = '9';
    context.currentRule.params.errorCount = '0';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfMenuInteractive.input(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfmenu rule');
    expect(response.ruleType).to.equal('DTMFMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Error ruleset');
  });

  it('DTMFMenu.input() input "9" errorCount: 2 without errorRuleSetName', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = '9';
    context.currentRule.params.errorCount = '0';
    context.customerState.CurrentRule_errorCount = '2';
    context.currentRule.params.errorRuleSetName = undefined;
    context.customerState.CurrentRule_errorRuleSetName = undefined;
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfMenuInteractive.input(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfmenu rule');
    expect(response.ruleType).to.equal('DTMFMenu');
    expect(response.audio).to.equal(undefined);
    expect(response.terminate).to.equal(true);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
  });

  it('DTMFMenu.input() "NOINPUT" errorCount: 2', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'NOINPUT';
    context.currentRule.params.errorCount = '2';
    context.customerState.CurrentRule_errorCount = '2';
    context.currentRule.params.errorRuleSetName = undefined;
    context.currentRule.params.noInputRuleSetName = 'XXXX';
    context.customerState.CurrentRule_noInputRuleSetName = 'No input error rule set';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfMenuInteractive.input(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfmenu rule');
    expect(response.ruleType).to.equal('DTMFMenu');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.customerState.NextRuleSet).to.equal('No input error rule set');
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
  });

  it('DTMFMenu.input() should fail for invalid context', async function()
  {
    var context = {
    };

    try
    {
      var response = await dtmfMenuInteractive.input(context);
      fail('UpdateState should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('DTMFMenu has invalid configuration');
    }
  });

  it('DTMFMenu.confirm() should fail', async function()
  {
    var context = makeTestContext();

    try
    {
      var response = await dtmfMenuInteractive.confirm(context);
      fail('DTMFMenu should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('DTMFMenu.confirm() is not implemented');
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
      name: 'My dtmfmenu rule',
      type: 'DTMFMenu',
      params: {
        offerMessage: 'Press 1 for sales. 2 for tech support XXX',
        errorCount: '0 XXX',
        errorRuleSetName: 'Error ruleset XXX',
        dtmf1: 'User pressed 1 XXX',
        dtmf2: 'User pressed 2 XXX',
        inputCount: '3 XXX',
        errorMessage1: 'Please select a valid option 1. XXX',
        errorMessage2: 'Please select a valid option 2. XXX',
        errorMessage3: 'Sorry I couldn\'t understand you. XXX'
      }
    },
    customerState: {
      CurrentRule_offerMessage: 'Press 1 for sales. 2 for tech support.',
      CurrentRule_errorCount: '0',
      CurrentRule_errorRuleSetName: 'Error ruleset',
      CurrentRule_dtmf1: 'User pressed 1',
      CurrentRule_dtmf2: 'User pressed 2',
      CurrentRule_inputCount: '3',
      CurrentRule_errorMessage1: 'Please select a valid option 1.',
      CurrentRule_errorMessage2: 'Please select a valid option 2.',
      CurrentRule_errorMessage3: 'Sorry I couldn\'t understand you.',
      System: {}
    },
    stateToSave: new Set()
  };
}
