// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const metricInteractive = rewire('../../lambda/interactive/Metric.js');

/**
 * Interactive tests for Metric
 */
describe('MetricTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('Metric.execute() should succeed', async function() {

    var context = makeTestContext();

    var response = await metricInteractive.execute(context);

    expect(response.message).to.equal(`Metric: ${context.customerState.CurrentRule_metricName} Value: ${context.customerState.CurrentRule_metricValue}`);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My metric rule');
    expect(response.ruleType).to.equal('Metric');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(0);

  });

  it('Metric.execute() should fail for invalid context', async function() {

    var context = {
      customerState: {}
    };

    try
    {
      var response = await metricInteractive.execute(context);
      fail('Metric should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('Metric.execute() missing required config');
    }
  });


  it('Metric.input() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await metricInteractive.input(context);
      fail('Metric should not implement input()');
    }
    catch (error)
    {
      expect(error.message).to.equal('Metric.input() is not implemented');
    }
  });

  it('Metric.confirm() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await metricInteractive.confirm(context);
      fail('Metric should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('Metric.confirm() is not implemented');
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
      name: 'My metric rule',
      type: 'Metric',
      params: {
        // These will have been transformed in the wild
        // but we should target the state value
        metricName: 'MyMetricName XXX',
        metricValue: '1 XXX',
      }
    },
    customerState: {
      CurrentRule_metricName: 'MyMetricName',
      CurrentRule_metricValue: '1'
    },
    stateToSave: new Set()
  };
}
