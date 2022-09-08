// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * TextInference interactive rule component definition exposing the following
 * lifecycle methods:
 *
 * execute() called on first invocation (required)
 * input() called after input on provided (optional)
 * confirm() called after confirmation is provided (optional)
 *
 * The context parameter contains:
 *
 *  - requestMessage: the current request message
 *  - currentRuleSet: the current rule set
 *  - currentRule: the current rule
 *  - customerState: the current customer state
 *  - stateToSave: A set containing the state fields to persist
 */

var inferenceUtils = require('../utils/InferenceUtils');
var commonUtils = require('../utils/CommonUtils');
var lexUtils = require('../utils/LexUtils');
var handlebarsUtils = require('../utils/HandlebarsUtils');

/**
 * Executes TextInference interactive rule which allows
 * determining a target rule set based on a matched intent
 * with a confidence threshold.
 * This is designed as an unattended rule, it will either match
 * an intent with a threshold or will fall through to the next rule.
 * execute() takes an input text payload and inferences the configured bot,
 * looking for intent matches that reach a threshold confidence.
 * The lex response is written to the customer's state under LexResponses.<bot name>.
 * for additional inspection.
 */
module.exports.execute = async (context) =>
{
  try
  {
    // Perform context validation
    validateContext(context);

    var input = context.customerState.CurrentRule_input;
    var lexBotName = context.customerState.CurrentRule_lexBotName;

    var lexBot = await lexUtils.findLexBotBySimpleName(lexBotName);
    var intentResponse = undefined;

    if (commonUtils.isEmptyString(input))
    {
      console.info(`TextInference.execute() found empty input, forcing fallback intent`);
      intentResponse = makeFallBackResponse();
    }
    else
    {
      console.info(`TextInference.execute() found non-empty input, inferencing lex`);
      intentResponse = await lexUtils.recognizeText(
        lexBot.Id,
        lexBot.AliasId,
        lexBot.LocaleId,
        input,
        context.requestMessage.contactId);
    }

    console.info(`TextInference.execute() got lex intent response: ${JSON.stringify(intentResponse, null, 2)}`);

    var nextRuleSet = context.customerState['CurrentRule_intentRuleSet_' + intentResponse.intent];

    if (!commonUtils.isEmptyString(nextRuleSet))
    {
      var intentConfidence = 0.0;

      if (commonUtils.isNumber(context.customerState['CurrentRule_intentConfidence_' + intentResponse.intent]))
      {
        intentConfidence = +context.customerState['CurrentRule_intentConfidence_' + intentResponse.intent];
      }

      if (intentResponse.confidence >= intentConfidence)
      {
        console.info(`TextInference.execute() reached required confidence: ${intentConfidence} with confidence: ${intentResponse.confidence} for intent: ${intentResponse.intent} routing to rule set: ${nextRuleSet}`)
        inferenceUtils.updateStateContext(context, 'NextRuleSet', nextRuleSet);
      }
      else
      {
        console.info(`TextInference.execute() did not reach required confidence: ${intentConfidence} with confidence: ${intentResponse.confidence} for intent: ${intentResponse.intent} routing to rule set: ${nextRuleSet}`)
      }
    }
    else
    {
      console.info(`TextInference.execute() found no rule set mapping for intent: ${intentResponse.intent} falling through`);
    }

    return {
      contactId: context.requestMessage.contactId,
      inputRequired: false,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type,
      lexResponse: intentResponse.lexResponse
    };
  }
  catch (error)
  {
    console.error('TextInference.execute() failed to text inference', error);
    throw error;
  }
};

/**
 * Executes TextInference input
 */
module.exports.input = async (context) =>
{
  console.error('TextInference.input() is not implemented');
  throw new Error('TextInference.input() is not implemented');
};

/**
 * Executes TextInference confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('TextInference.confirm() is not implemented');
  throw new Error('TextInference.confirm() is not implemented');
};

/**
 * Validates the context
 */
function validateContext(context)
{
  console.info(`TextInference.validateContext() context: ${JSON.stringify(context, null, 2)}`);

  if (context.requestMessage === undefined ||
      context.customerState === undefined ||
      context.currentRuleSet === undefined ||
      context.currentRule === undefined ||
      commonUtils.isEmptyString(context.customerState.CurrentRule_lexBotName))
  {
    throw new Error('TextInference.validateContext() invalid configuration detected');
  }
}

/**
 * Makes a fall back response for NOMATCH inputs
 */
function makeFallBackResponse()
{
  return {
    intent: 'FallbackIntent'
  };
}
