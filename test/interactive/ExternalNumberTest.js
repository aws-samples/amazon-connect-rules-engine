
var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const externalNumberInteractive = rewire('../../lambda/interactive/ExternalNumber.js');

/**
 * Interactive tests for ExternalNumber
 */
describe('ExternalNumberTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('ExternalNumber.execute() should succeed', async function() {

    var context = makeTestContext();

    var response = await externalNumberInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.externalNumber).to.equal('+61422529062');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My external number rule');
    expect(response.ruleType).to.equal('ExternalNumber');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(0);
  });

  it('ExternalNumber.execute() should fail for invalid context', async function() {

    var context = {
      customerState: {}
    };

    try
    {
      var response = await externalNumberInteractive.execute(context);
      fail('ExternalNumber should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('ExternalNumber.execute() missing required config');
    }
  });


  it('ExternalNumber.input() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await externalNumberInteractive.input(context);
      fail('ExternalNumber should not implement input()');
    }
    catch (error)
    {
      expect(error.message).to.equal('ExternalNumber.input() is not implemented');
    }
  });

  it('ExternalNumber.confirm() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await externalNumberInteractive.confirm(context);
      fail('ExternalNumber should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('ExternalNumber.confirm() is not implemented');
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
      name: 'My external number rule',
      type: 'ExternalNumber',
      params: {
        externalNumber: '+61422529062 XXX'
      }
    },
    customerState: {
      CurrentRule_externalNumber: '+61422529062'
    },
    stateToSave: new Set()
  };
}
