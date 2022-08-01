// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const setAttributesInteractive = rewire('../../lambda/interactive/SetAttributes.js');

/**
 * Interactive tests for SetAttributes
 */
describe('SetAttributesTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('SetAttributes.execute() should succeed with existing ContactAttributes', async function() {

    var context = makeTestContext();

    var response = await setAttributesInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My setattributes rule');
    expect(response.ruleType).to.equal('SetAttributes');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('ContactAttributes')).to.equal(true);
    expect(context.customerState.ContactAttributes.Key1).to.equal('Value1');
    expect(context.customerState.ContactAttributes.Key2).to.equal('Value2');
    expect(context.customerState.ContactAttributes.agt_test).to.equal('happy days');
  });

  it('SetAttributes.execute() should succeed without existing ContactAttributes', async function() {

    var context = makeTestContext();

    context.customerState.ContactAttributes = undefined;

    var response = await setAttributesInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My setattributes rule');
    expect(response.ruleType).to.equal('SetAttributes');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('ContactAttributes')).to.equal(true);
    expect(context.customerState.ContactAttributes.Key1).to.equal('Value1');
    expect(context.customerState.ContactAttributes.Key2).to.equal('Value2');
  });

  it('SetAttributes.execute() should succeed with empty value', async function() {

    var context = makeTestContext();

    context.currentRule.params.setAttributes[0].value = '';

    var response = await setAttributesInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My setattributes rule');
    expect(response.ruleType).to.equal('SetAttributes');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('ContactAttributes')).to.equal(true);
    expect(context.customerState.ContactAttributes.Key1).to.equal('');
    expect(context.customerState.ContactAttributes.Key2).to.equal('Value2');
  });

  it('SetAttributes.execute() should remove null values', async function() {

    var context = makeTestContext();

    context.currentRule.params.setAttributes[1].value = 'null';

    var response = await setAttributesInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My setattributes rule');
    expect(response.ruleType).to.equal('SetAttributes');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('ContactAttributes')).to.equal(true);
    expect(context.customerState.ContactAttributes.Key1).to.equal('Value1');
    expect(context.customerState.ContactAttributes.Key2).to.equal(undefined);
  });

  it('SetAttributes.execute() should remove undefined values', async function() {

    var context = makeTestContext();

    context.currentRule.params.setAttributes[1].value = 'undefined';

    var response = await setAttributesInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My setattributes rule');
    expect(response.ruleType).to.equal('SetAttributes');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('ContactAttributes')).to.equal(true);
    expect(context.customerState.ContactAttributes.Key1).to.equal('Value1');
    expect(context.customerState.ContactAttributes.Key2).to.equal(undefined);
  });

  it('SetAttributes.execute() should fail with invalid context', async function() {

    var context = {
      customerState: {}
    };

    try
    {
      var response = await setAttributesInteractive.execute(context);
      fail('SetAttributes should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('SetAttributes.execute() missing required config');
    }
  });

  it('SetAttributes.input() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await setAttributesInteractive.input(context);
      fail('SetAttributes should not implement input()');
    }
    catch (error)
    {
      expect(error.message).to.equal('SetAttributes.input() is not implemented');
    }
  });

  it('SetAttributes.confirm() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await setAttributesInteractive.confirm(context);
      fail('SetAttributes should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('SetAttributes.confirm() is not implemented');
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
      name: 'My setattributes rule',
      type: 'SetAttributes',
      params: {
        // These will have been massaged by rulesengine.js by now
        // we target currentRule.params for this data in interactive mode
        setAttributes: [
          {
            key: 'Key1',
            value: 'Value1'
          },
          {
            key: 'Key2',
            value: 'Value2'
          }
        ]
      }
    },
    customerState: {
      ContactAttributes: {
        agt_test: 'happy days'
      }
    },
    stateToSave: new Set()
  };
}
