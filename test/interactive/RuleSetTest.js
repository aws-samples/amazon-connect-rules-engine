
var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const ruleSetInteractive = rewire('../../lambda/interactive/RuleSet.js');

/**
 * Interactive tests for RuleSet
 */
describe('RuleSetTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('RuleSet.execute() with message should succeed', async function() {

    var context = makeTestContext();

    var response = await ruleSetInteractive.execute(context);

    expect(response.message).to.equal('I am taking you to the next ruleset, hold on tight!');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My ruleset rule');
    expect(response.ruleType).to.equal('RuleSet');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Next rule set');

  });

  it('RuleSet.execute() without message should succeed', async function() {

    var context = makeTestContext();

    context.currentRule.params.message = undefined;
    context.customerState.CurrentRule_message = undefined;

    var response = await ruleSetInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My ruleset rule');
    expect(response.ruleType).to.equal('RuleSet');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Next rule set');

  });

  it('RuleSet.execute(return here) without message should succeed', async function() {

    var context = makeReturnContext();

    context.currentRule.params.message = undefined;
    context.customerState.CurrentRule_message = undefined;

    var response = await ruleSetInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My ruleset rule');
    expect(response.ruleType).to.equal('RuleSet');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Next rule set');

    expect(context.stateToSave.has('ReturnStack')).to.equal(true);
    expect(context.customerState.ReturnStack.length).to.equal(1);
    expect(context.customerState.ReturnStack[0].ruleSetName).to.equal('My test rule set');
    expect(context.customerState.ReturnStack[0].ruleName).to.equal('My ruleset rule');

  });

  it('RuleSet.execute() should fail for invalid context', async function() {

    var context = {
      customerState: {}
    };

    try
    {
      var response = await ruleSetInteractive.execute(context);
      fail('RuleSet should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('RuleSet.execute() missing required config');
    }
  });


  it('RuleSet.input() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await ruleSetInteractive.input(context);
      fail('RuleSet should not implement input()');
    }
    catch (error)
    {
      expect(error.message).to.equal('RuleSet.input() is not implemented');
    }
  });

  it('RuleSet.confirm() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await ruleSetInteractive.confirm(context);
      fail('RuleSet should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('RuleSet.confirm() is not implemented');
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
      name: 'My ruleset rule',
      type: 'RuleSet',
      params: {
        message: 'I am taking you to the next ruleset, hold on tight! XXX',
        ruleSetName: 'Next rule set XXX'
      }
    },
    customerState: {
      CurrentRule_message: 'I am taking you to the next ruleset, hold on tight!',
      CurrentRule_ruleSetName: 'Next rule set'
    },
    stateToSave: new Set()
  };
}

/**
 * Makes a test context
 */
function makeReturnContext()
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
      name: 'My ruleset rule',
      type: 'RuleSet',
      params: {
        message: 'I am taking you to the next ruleset, hold on tight! XXX',
        ruleSetName: 'Next rule set XXX',
        returnHere: 'true XXX'
      }
    },
    customerState: {
      CurrentRule_message: 'I am taking you to the next ruleset, hold on tight!',
      CurrentRule_ruleSetName: 'Next rule set',
      CurrentRule_returnHere: 'true',
      CurrentRuleSet: 'My test rule set',
      CurrentRule: 'My ruleset rule'
    },
    stateToSave: new Set()
  };
}

