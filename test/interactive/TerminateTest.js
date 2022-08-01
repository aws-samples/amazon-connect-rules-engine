
var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const terminateInteractive = rewire('../../lambda/interactive/Terminate.js');

/**
 * Interactive tests for Terminate
 */
describe('TerminateTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('Terminate.execute() should succeed', async function()
  {
    var context = makeTestContext();

    var response = await terminateInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My terminate rule');
    expect(response.ruleType).to.equal('Terminate');
    expect(response.audio).to.equal(undefined);
    expect(response.terminate).to.equal(true);
    expect(context.stateToSave.size).to.equal(0);
  });

  it('Terminate.execute() should fail for invalid context', async function()
  {
    var context = {
    };

    try
    {
      var response = await terminateInteractive.execute(context);
      fail('UpdateState should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('Terminate.execute() missing required config');
    }
  });

  it('Terminate.input() should fail', async function()
  {
    var context = makeTestContext();

    try
    {
      var response = await terminateInteractive.input(context);
      fail('Terminate should not implement input()');
    }
    catch (error)
    {
      expect(error.message).to.equal('Terminate.input() is not implemented');
    }
  });

  it('Terminate.confirm() should fail', async function()
  {
    var context = makeTestContext();

    try
    {
      var response = await terminateInteractive.confirm(context);
      fail('Terminate should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('Terminate.confirm() is not implemented');
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
      name: 'My terminate rule',
      type: 'Terminate',
      params: {
      }
    },
    customerState: {
    },
    stateToSave: new Set()
  };
}
