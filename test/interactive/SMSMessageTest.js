
var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const smsMessageInteractive = rewire('../../lambda/interactive/SMSMessage.js');

/**
 * Interactive tests for SMSMessage
 */
describe('SMSMessageTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('SMSMessage.execute() should succeed with good phone number', async function()
  {
    var context = makeTestContext();

    var response = await smsMessageInteractive.execute(context);

    expect(response.message).to.equal(`SMS: +61422555555 Message: This is my message template!`);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My smsmessage rule');
    expect(response.ruleType).to.equal('SMSMessage');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(0);

  });

  it('SMSMessage.execute() should fail with bad phone number', async function()
  {
    try
    {
      var context = makeTestContext();

      context.currentRule.params.phoneNumberKey = 'SomeBadKey';
      context.customerState.CurrentRule_phoneNumberKey = 'SomeBadKey';

      var response = await smsMessageInteractive.execute(context);

      fail('Expect this to fail with a bad input phone number');
    }
    catch (error)
    {
      expect(error.message).to.equal('SMSMessage.execute() could not locate phone number with state key: SomeBadKey');
    }

  });

  it('SMSMessage.execute() should fail for invalid context', async function()
  {
    var context = {
      customerState: {}
    };

    try
    {
      var response = await smsMessageInteractive.execute(context);
      fail('SMSMessage should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('SMSMessage.execute() missing required config');
    }
  });


  it('SMSMessage.input() should fail', async function()
  {
    var context = makeTestContext();

    try
    {
      var response = await smsMessageInteractive.input(context);
      fail('SMSMessage should not implement input()');
    }
    catch (error)
    {
      expect(error.message).to.equal('SMSMessage.input() is not implemented');
    }
  });

  it('SMSMessage.confirm() should fail', async function()
  {
    var context = makeTestContext();

    try
    {
      var response = await smsMessageInteractive.confirm(context);
      fail('SMSMessage should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('SMSMessage.confirm() is not implemented');
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
      name: 'My smsmessage rule',
      type: 'SMSMessage',
      params: {
        message: 'This is my message template! XXX',
        phoneNumberKey: 'CustomerPhoneNumber XXX'
      }
    },
    customerState: {
      CustomerPhoneNumber: '+61422555555',
      CurrentRule_phoneNumberKey: 'CustomerPhoneNumber',
      CurrentRule_message: 'This is my message template!'
    },
    stateToSave: new Set()
  };
}
