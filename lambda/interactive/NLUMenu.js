// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Interactive rule component definition exposing the following
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
var configUtils = require('../utils/ConfigUtils');
var handlebarsUtils = require('../utils/HandlebarsUtils');

/**
 * Executes NLUMenu
 */
module.exports.execute = async (context) =>
{
  try
  {
    // Perform context validation
    validateContext(context);

    var offerMessage = context.customerState.CurrentRule_offerMessage;
    var outputStateKey = context.customerState.CurrentRule_outputStateKey;

    inferenceUtils.updateStateContext(context, outputStateKey, undefined);
    inferenceUtils.updateStateContext(context, 'System.LastNLUMenuIntent', undefined);
    inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'input');

    return {
      contactId: context.requestMessage.contactId,
      message: offerMessage,
      inputRequired: true,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type,
      dataType: context.currentRule.params.dataType,
      audio: await inferenceUtils.renderVoice(context.requestMessage, offerMessage)
    };
  }
  catch (error)
  {
    console.error('NLUMenu.execute() failed: ' + error.message);
    throw error;
  }
};


/**
 * Executes NLUMenu input
 */
module.exports.input = async (context) =>
{
  try
  {
    // Perform context validation
    validateContext(context);

    if (context.requestMessage.input === undefined)
    {
      throw new Error('NLUMenu.input() missing input');
    }

    var input = context.requestMessage.input;
    var outputStateKey = context.customerState.CurrentRule_outputStateKey;
    var errorCount = +context.customerState.CurrentRule_errorCount;
    var inputCount = +context.customerState.CurrentRule_inputCount;
    var lexBotName = context.customerState.CurrentRule_lexBotName;
    var autoConfirm = context.customerState.CurrentRule_autoConfirm === 'true';
    var autoConfirmConfidence = +context.customerState.CurrentRule_autoConfirmConfidence;
    var autoConfirmMessage = +context.customerState.CurrentRule_autoConfirmMessage;

    // Clear out the last output state
    inferenceUtils.updateStateContext(context, 'System.LastNLUMenuIntent', undefined);
    inferenceUtils.updateStateContext(context, outputStateKey, undefined);

    var lexBot = await module.exports.findLexBot(lexBotName);
    var intentResponse = undefined;

    // If we get NOINPUT or NOMATCH assume fallback
    if (input === 'NOINPUT' || input === 'NOMATCH')
    {
      console.info(`NLUMenu.input() found input: ${input}, forcing fallback intent`);
      intentResponse = makeFallBackResponse();
    }
    else
    {
      console.info(`NLUMenu.input() found valid input, inferencing bot`);
      intentResponse = await inferenceLexBot(lexBot, input, context.requestMessage.contactId);
    }

    // Find a matched intent mapping
    var matchedIntent = intentResponse.intent;
    var matchedIntentRuleSet = context.customerState['CurrentRule_intentRuleSet_' + matchedIntent];
    var confirmationMessage = context.customerState['CurrentRule_intentConfirmationMessage_' + matchedIntent];
    var autoConfirmationMessage = context.customerState['CurrentRule_autoConfirmMessage'];

    console.info(`NLUMenu.input() found next rule set: ${matchedIntentRuleSet} ` +
          `for intent: ${matchedIntent} with confidence: ${intentResponse.confidence} ` +
          `with auto confirm enabled: ${autoConfirm} and ` +
          `auto confirm confidence: ${autoConfirmConfidence} with intent response: ` +
          `${JSON.stringify(intentResponse, null, 2)}`);

    if (!commonUtils.isEmptyString(matchedIntentRuleSet))
    {
      if (autoConfirm && intentResponse.confidence >= autoConfirmConfidence)
      {
        console.info(`NLUMenu.input() found high confidence intent match with auto confirm enabled`);

        inferenceUtils.updateStateContext(context, outputStateKey, matchedIntent);
        inferenceUtils.updateStateContext(context, 'NextRuleSet', matchedIntentRuleSet);
        inferenceUtils.updateStateContext(context, 'System.LastNLUMenuIntent', matchedIntent);
        inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'true');
        inferenceUtils.updateStateContext(context, 'CurrentRule_matchedIntent', matchedIntent);
        inferenceUtils.updateStateContext(context, 'CurrentRule_matchedIntentRuleSet', matchedIntentRuleSet);
        inferenceUtils.updateStateContext(context, 'CurrentRule_matchedIntentConfidence', '' + intentResponse.confidence);

        var confirmationMessageFinal = handlebarsUtils.template(autoConfirmationMessage, context.customerState);

        console.info(`NLUMenu.input() made final auto confirmation message: ${confirmationMessageFinal}`);

        return {
          contactId: context.requestMessage.contactId,
          message: confirmationMessageFinal,
          inputRequired: false,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          lexResponse: intentResponse.lexResponse,
          audio: await inferenceUtils.renderVoice(context.requestMessage, confirmationMessageFinal)
        };
      }
      else
      {
        console.info(`NLUMenu.input() requesting manual confirmation of intent match`);

        inferenceUtils.updateStateContext(context, outputStateKey, undefined);
        inferenceUtils.updateStateContext(context, 'NextRuleSet', undefined);
        inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'confirm');
        inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'true');
        inferenceUtils.updateStateContext(context, 'System.LastNLUMenuIntent', undefined);
        inferenceUtils.updateStateContext(context, 'CurrentRule_matchedIntent', matchedIntent);
        inferenceUtils.updateStateContext(context, 'CurrentRule_matchedIntentRuleSet', matchedIntentRuleSet);

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          message: confirmationMessage,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          lexResponse: intentResponse.lexResponse,
          audio: await inferenceUtils.renderVoice(context.requestMessage, confirmationMessage)
        };
      }
    }
    else
    {
      errorCount++;
      var errorMessage = context.customerState['CurrentRule_errorMessage' + errorCount];

      inferenceUtils.updateStateContext(context, outputStateKey, undefined);
      inferenceUtils.updateStateContext(context, 'NextRuleSet', undefined);
      inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'false');
      inferenceUtils.updateStateContext(context, 'System.LastNLUMenuIntent', undefined);
      inferenceUtils.updateStateContext(context, 'CurrentRule_errorCount', '' + errorCount);

      if (errorCount >= inputCount)
      {
        console.error('NLUMenu.input() reached max error count');

        var errorRuleSetName = context.customerState.CurrentRule_errorRuleSetName;

        if (!commonUtils.isEmptyString(errorRuleSetName))
        {
          console.info(`NLUMenu.input() found error rule set: ${errorRuleSetName}`);
          inferenceUtils.updateStateContext(context, 'NextRuleSet', errorRuleSetName);

          return {
            contactId: context.requestMessage.contactId,
            inputRequired: false,
            ruleSet: context.currentRuleSet.name,
            rule: context.currentRule.name,
            ruleType: context.currentRule.type,
            message: errorMessage,
            lexResponse: intentResponse.lexResponse,
            audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
          };
        }
        else
        {
          console.error(`NLUMenu.input() no error rule set, terminating`);

          return {
            contactId: context.requestMessage.contactId,
            inputRequired: false,
            terminate: true,
            message: errorMessage,
            ruleSet: context.currentRuleSet.name,
            rule: context.currentRule.name,
            ruleType: context.currentRule.type,
            lexResponse: intentResponse.lexResponse,
            audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
          };
        }
      }
      else
      {
        console.info('NLUMenu.input() prompting the customer for input again');

        errorMessage += '\n' + context.customerState.CurrentRule_offerMessage;

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          message: errorMessage,
          lexResponse: intentResponse.lexResponse,
          audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
        };
      }
    }
  }
  catch (error)
  {
    console.error('NLUMenu.input() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes NLUMenu confirm
 */
module.exports.confirm = async (context) =>
{
  try
  {
    // Perform context validation
    validateContext(context);

    var errorCount = +context.customerState.CurrentRule_errorCount;
    var inputCount = +context.customerState.CurrentRule_inputCount;

    var input = context.requestMessage.input;
    var matchedIntent = context.customerState.CurrentRule_matchedIntent;
    var matchedIntentRuleSet = context.customerState.CurrentRule_matchedIntentRuleSet;
    var outputStateKey = context.customerState.CurrentRule_outputStateKey;

    if (commonUtils.isEmptyString(input) ||
        commonUtils.isEmptyString(matchedIntent) ||
        commonUtils.isEmptyString(matchedIntentRuleSet))
    {
      throw new Error('NLUMenu.confirm() missing required input or matched intent');
    }

    var lexBotName = 'yesno';
    var lexBot = await module.exports.findLexBot(lexBotName);
    var intentResponse = await inferenceLexBot(lexBot, input, context.requestMessage.contactId);

    if (intentResponse.intent === 'Yes')
    {
      console.info('NLUMenu.confirm() found the Yes intent');

      // Intent is confirmed, save it and go next
      inferenceUtils.updateStateContext(context, 'NextRuleSet', matchedIntentRuleSet);
      inferenceUtils.updateStateContext(context, outputStateKey, matchedIntent);
      inferenceUtils.updateStateContext(context, 'System.LastNLUMenuIntent', matchedIntent);

      return {
        contactId: context.requestMessage.contactId,
        inputRequired: false,
        ruleSet: context.currentRuleSet.name,
        rule: context.currentRule.name,
        ruleType: context.currentRule.type,
        lexResponse: intentResponse.lexResponse
      };
    }
    else
    {
      console.error(`NLUMenu.confirm() found non-Yes intent: ${intentResponse.intent}`);

      errorCount++;
      var errorMessage = context.customerState['CurrentRule_errorMessage' + errorCount];
      inferenceUtils.updateStateContext(context, 'CurrentRule_errorCount', '' + errorCount);

      if (errorCount >= inputCount)
      {
        console.error('NLUMenu.confirm() reached max error count');

        var errorRuleSetName = context.customerState.CurrentRule_errorRuleSetName;

        if (!commonUtils.isEmptyString(errorRuleSetName))
        {
          console.info(`NLUMenu.confirm() found error rule set: ${errorRuleSetName}`);
          inferenceUtils.updateStateContext(context, 'NextRuleSet', errorRuleSetName);

          return {
            contactId: context.requestMessage.contactId,
            inputRequired: false,
            ruleSet: context.currentRuleSet.name,
            rule: context.currentRule.name,
            ruleType: context.currentRule.type,
            message: errorMessage,
            lexResponse: intentResponse.lexResponse,
            audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
          };
        }
        else
        {
          console.error(`NLUMenu.confirm() no error rule set, terminating`);

          return {
            contactId: context.requestMessage.contactId,
            inputRequired: false,
            terminate: true,
            message: errorMessage,
            ruleSet: context.currentRuleSet.name,
            rule: context.currentRule.name,
            ruleType: context.currentRule.type,
            lexResponse: intentResponse.lexResponse,
            audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
          };
        }
      }
      else
      {
        console.info('NLUMenu.confirm() prompting the customer for input again');

        inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'input');
        inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'false');
        inferenceUtils.updateStateContext(context, 'CurrentRule_matchedIntent', undefined);
        inferenceUtils.updateStateContext(context, 'CurrentRule_matchedIntentRuleSet', undefined);

        errorMessage = context.customerState.CurrentRule_offerMessage;

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          message: errorMessage,
          lexResponse: intentResponse.lexResponse,
          audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
        };
      }
    }
  }
  catch (error)
  {
    console.error('NLUMenu.confirm() failed: ' + error.message);
    throw error;
  }
};

/**
 * Validates the context
 */
function validateContext(context)
{
  if (context.requestMessage === undefined ||
      context.customerState === undefined ||
      context.currentRuleSet === undefined ||
      context.currentRule === undefined ||
      context.customerState.CurrentRule_errorCount === undefined ||
      context.customerState.CurrentRule_inputCount === undefined ||
      context.customerState.CurrentRule_lexBotName === undefined ||
      context.customerState.CurrentRule_outputStateKey === undefined ||
      context.customerState.CurrentRule_offerMessage === undefined ||
      context.customerState.CurrentRule_errorMessage1 === undefined)
  {
    throw new Error('NLUMenu has invalid configuration');
  }

  if (context.customerState.CurrentRule_autoConfirm === 'true'
    && commonUtils.isEmptyString(context.customerState.CurrentRule_autoConfirmMessage))
  {
    throw new Error('NLUMenu auto confirm is enabled but an auto confirm message was not provided');
  }

  if (!commonUtils.isNumber(context.customerState.CurrentRule_errorCount))
  {
    throw new Error('NLUMenu error count must be a number');
  }

  if (!commonUtils.isNumber(context.customerState.CurrentRule_inputCount))
  {
    throw new Error('NLUMenu input count must be a number');
  }

  if (!commonUtils.isNumber(context.customerState.CurrentRule_autoConfirmConfidence))
  {
    throw new Error('NLUMenu auto confirm confidence must be a number between 0.0 and 1.0');
  }

  var confidence = +context.customerState.CurrentRule_autoConfirmConfidence;

  if (confidence < 0 || confidence > 1)
  {
    throw new Error('NLUMenu auto confirm confidence must be a number between 0.0 and 1.0');
  }

  var inputCount = +context.customerState.CurrentRule_inputCount;

  if (inputCount < 1 || inputCount > 3)
  {
    throw new Error('NLUMenu input count must be between 1 and 3');
  }

  if (inputCount > 1 &&
      context.customerState.CurrentRule_errorMessage2 === undefined)
  {
    throw new Error('NLUMenu is missing required error message 2');
  }

  if (inputCount > 2 &&
      context.customerState.CurrentRule_errorMessage3 === undefined)
  {
    throw new Error('NLUMenu is missing required error message 3');
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

/**
 * Locates a lex bot by simple name or throws
 */
module.exports.findLexBot = async (lexBotName) =>
{
  var lexBots = await configUtils.getLexBots(process.env.CONFIG_TABLE);
  var lexBot = lexBots.find(lexBot => lexBot.SimpleName === lexBotName);

  if (lexBot === undefined)
  {
    throw new Error('NLUMenu.findLexBot() could not find Lex bot: ' + lexBotName);
  }

  return lexBot;
};

/**
 * Inferences a lex bot using recognizeText()
 */
async function inferenceLexBot(lexBot, input, contactId)
{
  return await lexUtils.recognizeText(lexBot.Id, lexBot.AliasId, lexBot.LocaleId, input, contactId);
}
