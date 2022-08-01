// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const distributionInteractive = rewire('../../lambda/interactive/Distribution.js');

/**
 * Interactive tests for Distribution
 */
describe('DistributionTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('Distribution.execute(sure thing) should succeed', async function() {

    var context = makeSureThingContext();

    var response = await distributionInteractive.execute(context);

    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My ruleset rule');
    expect(response.ruleType).to.equal('Distribution');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Zero ruleset');
  });

  it('Distribution.execute(50 50) should succeed', async function() {

    var context = makeFiftyFiftyContext();

    var response = await distributionInteractive.execute(context);

    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My ruleset rule');
    expect(response.ruleType).to.equal('Distribution');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    var options = [
      'Default rule set',
      'Zero ruleset'
    ];

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(options.includes(context.customerState.NextRuleSet)).to.be.true;
  });

  it('Distribution.execute() should fail for invalid context', async function() {

    var context = {
      customerState: {}
    };

    try
    {
      var response = await distributionInteractive.execute(context);
      fail('Distribution should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('Distribution.execute() missing required config');
    }
  });


  it('Distribution.input() should fail', async function() {

    var context = makeSureThingContext();

    try
    {
      var response = await distributionInteractive.input(context);
      fail('Distribution should not implement input()');
    }
    catch (error)
    {
      expect(error.message).to.equal('Distribution.input() is not implemented');
    }
  });

  it('Distribution.confirm() should fail', async function() {

    var context = makeSureThingContext();

    try
    {
      var response = await distributionInteractive.confirm(context);
      fail('Distribution should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('Distribution.confirm() is not implemented');
    }
  });

});

/**
 * Makes a sure thing test context
 */
function makeSureThingContext()
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
      type: 'Distribution',
      params: {
        defaultRuleSetName: 'Default rule set XXX',
        optionCount: '1 XXX',
        ruleSetName0: 'Zero ruleset XXX',
        percentage0: '100 XXX'
      }
    },
    customerState: {
      CurrentRule_defaultRuleSetName: 'Default rule set',
      CurrentRule_optionCount: '1',
      CurrentRule_ruleSetName0: 'Zero ruleset',
      CurrentRule_percentage0: '100'
    },
    stateToSave: new Set()
  };
}

/**
 * Makes a 50 50 thing context
 */
function makeFiftyFiftyContext()
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
      type: 'Distribution',
      params: {
        defaultRuleSetName: 'Default rule set XXX',
        optionCount: '1 XXX',
        ruleSetName0: 'Zero ruleset XXX',
        percentage0: '50 XXX'
      }
    },
    customerState: {
      CurrentRule_defaultRuleSetName: 'Default rule set',
      CurrentRule_optionCount: '1',
      CurrentRule_ruleSetName0: 'Zero ruleset',
      CurrentRule_percentage0: '50'
    },
    stateToSave: new Set()
  };
}
