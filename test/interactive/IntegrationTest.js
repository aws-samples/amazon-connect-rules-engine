
var rewire = require('rewire');
const expect = require('chai').expect;
const AWSMock = require('aws-sdk-mock');
const interactiveConfig = require('./InteractiveConfig.js');
const integrationInteractive = rewire('../../lambda/interactive/Integration.js');
const lambdaMocker = require('../utils/LambdaMocker.js');
const lambdaUtils = require('../../lambda/utils/LambdaUtils.js');
const dynamoStateTableMocker = require('../utils/DynamoStateTableMocker.js');
const dynamoUtils = require('../../lambda/utils/DynamoUtils.js');

/**
 * Interactive tests for Integration
 */
describe('IntegrationTests', function()
{
  this.beforeAll(function () {

    this.timeout(3000);

    AWSMock.restore();

    interactiveConfig.loadEnv();

    // Mock state loading and saving
    dynamoStateTableMocker.setupMockDynamo(AWSMock, dynamoUtils);

    // Mock config loads
    lambdaMocker.setupMockLambda(AWSMock, lambdaUtils);
  });

  this.afterAll(function () {
    AWSMock.restore();
  });

  it('Integration.execute() should succeed', async function()
  {
    var context = makeTestContext();

    dynamoStateTableMocker.injectState(context.requestMessage.contactId, context.customerState);

    var response = await integrationInteractive.execute(context);

    expect(response.message).to.equal('Function: integrationecho IntegrationStatus: TIMEOUT');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My Integration rule');
    expect(response.ruleType).to.equal('Integration');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(0);

    expect(context.customerState.IntegrationStatus).to.equal('TIMEOUT');
  });

  /**
   * Test what happens with an invalid context
   */
  it('Integration.execute() should fail for invalid context', async function() {

    var context = {
      requestMessage: {},
      customerState: {}
    };

    try
    {
      var response = await integrationInteractive.execute(context);
    }
    catch (error)
    {
      expect(error.message).to.equal('Integration.execute() missing required config');
    }
  });


  it('Integration.input() should fail', async function()
  {
    var context = makeTestContext();

    try
    {
      var response = await integrationInteractive.input(context);
      throw new Error('Integration.input() should not be implemented');
    }
    catch (error)
    {
      expect(error.message).to.equal('Integration.input() is not implemented');
    }
  });

  it('Integration.confirm() should fail', async function()
  {
    var context = makeTestContext();

    try
    {
      var response = await integrationInteractive.confirm(context);
      throw new Error('Integration.confirm() should not be implemented');
    }
    catch (error)
    {
      expect(error.message).to.equal('Integration.confirm() is not implemented');
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
      name: 'My Integration rule',
      type: 'Integration',
      params: {
        functionName: 'integrationecho XXX',
        functionArn: `arn:aws:lambda:ap-southeast-2:${process.env.accountNumber}:function:${process.env.stage}-${process.env.service}-integrationecho XXX`,
        functionPayload: '{"Hello":"Test XXXX"}',
        functionOutputKey: 'Sneh XXX',
        functionTimeout: '1 XXX'
      }
    },
    customerState: {
      CurrentRule_functionName: 'integrationecho',
      CurrentRule_functionArn: `arn:aws:lambda:ap-southeast-2:${process.env.accountNumber}:function:${process.env.stage}-${process.env.service}-integrationecho`,
      CurrentRule_functionPayload: '{"Hello":"Test"}',
      CurrentRule_functionOutputKey: 'Sneh',
      CurrentRule_functionTimeout: '1',
    },
    stateToSave: new Set()
  };
}
