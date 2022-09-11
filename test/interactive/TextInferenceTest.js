// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const expect = require('chai').expect;
const sinon = require('sinon');
const AWSMock = require('aws-sdk-mock');
const lexRuntimeV2Mocker = require('../utils/LexRuntimeV2Mocker');
const interactiveConfig = require('./InteractiveConfig');
const textInferenceInteractive = require('../../lambda/interactive/TextInference');
const configUtils = require('../../lambda/utils/ConfigUtils');
const lexUtils = require('../../lambda/utils/LexUtils');

/**
 * TextInference tests
 */
describe('TextInferenceTests', function()
{
  this.beforeAll(function()
  {
    interactiveConfig.loadEnv();

    // Mock lex bot interactions
    lexRuntimeV2Mocker.setupMockLexRuntimeV2(AWSMock, lexUtils);

    var getLexBots = sinon.fake.returns([
      {
        "Name": "unittesting-rules-engine-date",
        "SimpleName": "date",
        "Arn": "arn:aws:lex:ap-southeast-2:55555555:bot-alias/A9EYOXQ8FF/E8SEC9JHHC",
        "Id": "A9EYOXQ8FF",
        "LocaleId": "en_AU",
        "AliasId": "E8SEC9JHHC"
      },
      {
        "Name": "unittesting-rules-engine-yesno",
        "SimpleName": "yesno",
        "Arn": "arn:aws:lex:ap-southeast-2:55555555:bot-alias/A9EYOXQ8TT/E8SEC9JHLP",
        "Id": "A9EYOXQ8TT",
        "LocaleId": "en_AU",
        "AliasId": "E8SEC9JHLP"
      },
      {
        "Name": "unittesting-rules-engine-intent",
        "SimpleName": "intent",
        "Arn": "arn:aws:lex:ap-southeast-2:55555555:bot-alias/A9EYOXQ8FF/GGSEC9JHLP",
        "Id": "A9EYOXQ8FF",
        "LocaleId": "en_AU",
        "AliasId": "GGSEC9JHLP"
      }
    ]);

    sinon.replace(configUtils, 'getLexBots', getLexBots);
  });

  this.afterAll(function()
  {
    sinon.restore();
    AWSMock.restore('LexRuntimeV2');
  });

  // Tests text inferencing with invalid context
  it('TextInference.execute() invalid context', async function()
  {
    var context = makeTestContext();
    context.customerState.CurrentRule_lexBotName = '';

    try
    {
      await textInferenceInteractive.execute(context);
      throw new Error('Expected failure due to invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('TextInference.validateContext() invalid configuration detected');
    }
  });

  // Tests text inferencing with missing bot
  it('TextInference.execute() missing bot', async function()
  {
    var context = makeTestContext();
    context.customerState.CurrentRule_lexBotName = 'stuff';

    try
    {
      await textInferenceInteractive.execute(context);
      throw new Error('Expected failure due to missing bot');
    }
    catch (error)
    {
      expect(error.message).to.equal('LexUtils.findLexBotBySimpleName() could not find Lex bot by simple name: stuff');
    }
  });

  // Tests falling through with no input and no fallback
  it('TextInference.execute() no input or fallback', async function()
  {
    var context = makeTestContext();

    context.customerState.CurrentRule_intentRuleSet_FallbackIntent = '';

    context.customerState.CurrentRule_input = '';
    var response = await textInferenceInteractive.execute(context);
    expect(context.stateToSave.size).to.equal(0);
    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);

    context.customerState.CurrentRule_input = null;
    response = await textInferenceInteractive.execute(context);
    expect(context.stateToSave.size).to.equal(0);
    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);

    context.customerState.CurrentRule_input = undefined;
    response = await textInferenceInteractive.execute(context);
    expect(context.stateToSave.size).to.equal(0);
    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);

  });

  // Tests falling through with no input and but fallback
  it('TextInference.execute() no input but fallback', async function()
  {
    var context = makeTestContext();
    context.customerState.CurrentRule_input = '';
    var response = await textInferenceInteractive.execute(context);
    expect(context.stateToSave.size).to.equal(0);
    expect(context.customerState.NextRuleSet).to.equal(undefined);

    context = makeTestContext();
    context.customerState.CurrentRule_input = null;
    response = await textInferenceInteractive.execute(context);
    expect(context.stateToSave.size).to.equal(0);
    expect(context.customerState.NextRuleSet).to.equal(undefined);

    context = makeTestContext();
    context.customerState.CurrentRule_input = undefined;
    response = await textInferenceInteractive.execute(context);
    expect(context.stateToSave.size).to.equal(0);
    expect(context.customerState.NextRuleSet).to.equal(undefined);
  });

  // Tests text inferencing for an intent with high confidence
  it('TextInference.execute() vanilla routing handler', async function()
  {
    var context = makeTestContext();

    var response = await textInferenceInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test-textinference-rule');
    expect(response.ruleSet).to.equal('My text inference ruleset');
    expect(response.rule).to.equal('My text inference rule');
    expect(response.ruleType).to.equal('TextInference');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Technical support ruleset');
  });

  // Tests text inferencing for an intent with insufficient confidence
  it('TextInference.execute() insufficent confidence', async function()
  {
    var context = makeTestContext();

    context.customerState.CurrentRule_intentConfidence_TechnicalSupport = '1.0';

    var response = await textInferenceInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test-textinference-rule');
    expect(response.ruleSet).to.equal('My text inference ruleset');
    expect(response.rule).to.equal('My text inference rule');
    expect(response.ruleType).to.equal('TextInference');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(0);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);
  });

  // Tests text inferencing with unmapped fallback intent
  it('TextInference.execute() fallback intent no mapping', async function()
  {
    var context = makeTestContext();

    context.customerState.CurrentRule_intentRuleSet_FallbackIntent = '';
    context.customerState.CurrentRule_input = 'Smeh McInputty Stuff';

    var response = await textInferenceInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test-textinference-rule');
    expect(response.ruleSet).to.equal('My text inference ruleset');
    expect(response.rule).to.equal('My text inference rule');
    expect(response.ruleType).to.equal('TextInference');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(0);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);
  });

  // Tests text inferencing with mapped fallback intent
  it('TextInference.execute() fallback intent mapping', async function()
  {
    var context = makeTestContext();

    context.customerState.CurrentRule_input = 'Smeh McInputty Stuff';

    var response = await textInferenceInteractive.execute(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test-textinference-rule');
    expect(response.ruleSet).to.equal('My text inference ruleset');
    expect(response.rule).to.equal('My text inference rule');
    expect(response.ruleType).to.equal('TextInference');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Fallback ruleset');
  });

  // Tests TextInference.input() fails
  it('TextInference.input() not implemented', async function()
  {
    var context = makeTestContext();

    try
    {
      await textInferenceInteractive.input(context);
      throw new Error('Expected failure due to input not implemented');
    }
    catch (error)
    {
      expect(error.message).to.equal('TextInference.input() is not implemented');
    }
  });

  // Tests TextInference.confirm() fails
  it('TextInference.confirm() not implemented', async function()
  {
    var context = makeTestContext();

    try
    {
      await textInferenceInteractive.confirm(context);
      throw new Error('Expected failure due to confirm not implemented');
    }
    catch (error)
    {
      expect(error.message).to.equal('TextInference.confirm() is not implemented');
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
      contactId: 'test-textinference-rule',
      generateVoice: false
    },
    currentRuleSet: {
      name: 'My text inference ruleset'
    },
    currentRule: {
      name: 'My text inference rule',
      type: 'TextInference',
      params: {
      }
    },
    customerState: {
      CurrentRule_input: 'I have a technical support question',
      CurrentRule_lexBotName: 'intent',
      CurrentRule_intentRuleSet_TechnicalSupport: 'Technical support ruleset',
      CurrentRule_intentConfidence_TechnicalSupport: '0.8',
      CurrentRule_intentRuleSet_FallbackIntent: 'Fallback ruleset',
      System: {}
    },
    stateToSave: new Set()
  };
}
