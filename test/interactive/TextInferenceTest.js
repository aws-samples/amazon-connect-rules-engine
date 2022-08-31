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

  // Tests vanilla routing handler should fail with invalid context
  it('TextInference.handler() vanilla routing handler', async function()
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
      CurrentRule_intentRuleSet_FalbackIntent: 'Fallback ruleset',
      System: {}
    },
    stateToSave: new Set()
  };
}
