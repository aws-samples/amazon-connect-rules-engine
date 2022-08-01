
var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const updateStatesInteractive = rewire('../../lambda/interactive/UpdateStates.js');

/**
 * Interactive tests for UpdateStates
 */
describe('UpdateStatesTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('UpdateStates.execute() should succeed', async function() {

    var context = makeTestContext();

    context.customerState.MyStateKey2 = 'foo';

    var response = await updateStatesInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My update states rule');
    expect(response.ruleType).to.equal('UpdateStates');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('MyStateKey1')).to.equal(true);
    expect(context.customerState.MyStateKey1).to.equal('55');

    expect(context.stateToSave.has('MyStateKey2')).to.equal(true);
    expect(context.customerState.MyStateKey2).to.equal(undefined);

    expect(context.stateToSave.has('MyStateKey3')).to.equal(true);
    expect(context.customerState.MyStateKey3).to.equal('1');

    expect(context.stateToSave.has('MyStateKey4')).to.equal(false);
    expect(context.customerState.MyStateKey4).to.equal(undefined);
  });

  it('UpdateStates.execute() should parse JSON', async function() {

    var context = makeTestContext();

    context.customerState.CurrentRule_updateStates = [];

    context.customerState.CurrentRule_updateStates.push({
      key: 'MyJSONKey1',
      value: '{\"testKey\": \"Test value\"}'
    });

    context.customerState.CurrentRule_updateStates.push({
      key: 'MyJSONKey2',
      value: '[ \"testValue1\", \"testValue2\" ]'
    });

    context.customerState.CurrentRule_updateStates.push({
      key: 'MyBadKey1',
      value: '{ Stuff }'
    });

    var response = await updateStatesInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My update states rule');
    expect(response.ruleType).to.equal('UpdateStates');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('MyJSONKey1')).to.equal(true);
    expect(context.customerState.MyJSONKey1.testKey).to.equal('Test value');

    expect(context.stateToSave.has('MyJSONKey2')).to.equal(true);
    expect(context.customerState.MyJSONKey2.length).to.equal(2);
    expect(context.customerState.MyJSONKey2[0]).to.equal('testValue1');
    expect(context.customerState.MyJSONKey2[1]).to.equal('testValue2');

    expect(context.stateToSave.has('MyBadKey1')).to.equal(true);
    expect(context.customerState.MyBadKey1).to.equal('{ Stuff }');
  });

  it('UpdateStates.execute() should succeed', async function() {

    var context = makeTestContext();

    context.customerState.MyStateKey3 = '7';

    var response = await updateStatesInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My update states rule');
    expect(response.ruleType).to.equal('UpdateStates');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('MyStateKey1')).to.equal(true);
    expect(context.customerState.MyStateKey1).to.equal('55');

    expect(context.stateToSave.has('MyStateKey2')).to.equal(false);
    expect(context.customerState.MyStateKey2).to.equal(undefined);

    expect(context.stateToSave.has('MyStateKey3')).to.equal(true);
    expect(context.customerState.MyStateKey3).to.equal('8');

    expect(context.stateToSave.has('MyStateKey4')).to.equal(false);
    expect(context.customerState.MyStateKey4).to.equal(undefined);
  });

  it('UpdateStates.execute() should fail for invalid context', async function() {

    var context = {
      customerState: {}
    };

    try
    {
      var response = await updateStatesInteractive.execute(context);
      fail('UpdateStates should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('UpdateStates.execute() missing required config');
    }
  });

  it('UpdateStates.input() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await updateStatesInteractive.input(context);
      fail('UpdateState should not implement input()');
    }
    catch (error)
    {
      expect(error.message).to.equal('UpdateStates.input() is not implemented');
    }
  });

  it('UpdateStates.confirm() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await updateStatesInteractive.confirm(context);
      fail('UpdateStates should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('UpdateStates.confirm() is not implemented');
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
      name: 'My update states rule',
      type: 'UpdateStates',
      params: {
        stateKey: 'MyStateKey XXX',
        stateValue: '55 XXX',
        updateStates: [
          {
            key: 'MyStateKey1 XXX',
            value: '55 XXX'
          },
          {
            key: 'MyStateKey2 XXX',
            value: 'XXX'
          },
          {
            key: 'MyStateKey3 XXX',
            value: 'increment XXX'
          },
          {
            key: 'MyStateKey4 XXX',
            value: 'null XXX'
          }
        ]
      }
    },
    customerState: {
      CurrentRule_updateStates: [
        {
          key: 'MyStateKey1',
          value: '55'
        },
        {
          key: 'MyStateKey2',
          value: ''
        },
        {
          key: 'MyStateKey3',
          value: 'increment'
        },
        {
          key: 'MyStateKey4',
          value: 'null'
        },
      ]
    },
    stateToSave: new Set()
  };
}
