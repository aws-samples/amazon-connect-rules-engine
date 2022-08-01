// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const queueInteractive = rewire('../../lambda/interactive/Queue.js');

/**
 * Interactive tests for Queue
 * TODO add support for hours of operations checks
 */
describe('QueueTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('Queue.execute() with message should succeed', async function() {

    var context = makeTestContext();

    var response = await queueInteractive.execute(context);

    expect(response.message).to.equal('You are queue bound my matie');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.queue).to.equal('Billing');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My queue rule');
    expect(response.ruleType).to.equal('Queue');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(0);
  });

  it('Queue.execute() without message should succeed', async function() {

    var context = makeTestContext();

    context.currentRule.params.message = undefined;
    context.customerState.CurrentRule_message = undefined;

    var response = await queueInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.queue).to.equal('Billing');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My queue rule');
    expect(response.ruleType).to.equal('Queue');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(0);
  });


  it('Queue.execute() should fail for invalid context', async function() {

    var context = {
      customerState: {}
    };

    try
    {
      var response = await queueInteractive.execute(context);
      fail('Queue should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('Queue.execute() missing required config');
    }
  });


  it('Queue.input() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await queueInteractive.input(context);
      fail('Queue should not implement input()');
    }
    catch (error)
    {
      expect(error.message).to.equal('Queue.input() is not implemented');
    }
  });

  it('Queue.confirm() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await queueInteractive.confirm(context);
      fail('Queue should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('Queue.confirm() is not implemented');
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
      name: 'My queue rule',
      type: 'Queue',
      params: {
        queueName: 'Billing XXX',
        message: 'You are queue bound my matie XXX'
      }
    },
    customerState: {
      CurrentRule_queueName: 'Billing',
      CurrentRule_message: 'You are queue bound my matie',
    },
    stateToSave: new Set()
  };
}
