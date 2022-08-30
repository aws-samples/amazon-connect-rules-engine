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
 * Executes NLUInput
 */
module.exports.execute = async (context) =>
{
  try
  {
    // Perform context validation
    validateContext(context);

    var offerMessage = context.customerState.CurrentRule_offerMessage;

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
    console.error('NLUInput.execute() failed: ' + error.message);
    throw error;
  }

};

/**
 * Executes NLUInput input
 */
module.exports.input = async (context) =>
{
  try
  {
    // Perform context validation
    validateContext(context);

    if (context.requestMessage.input === undefined)
    {
      throw new Error('NLUInput.input() missing input');
    }

    var input = context.requestMessage.input;

    // Clear out the last input
    context.customerState.System.LastNLUInputSlot = slotValue;
    inferenceUtils.updateStateContext(context, 'System', context.customerState.System);

    var errorCount = +context.customerState.CurrentRule_errorCount
    var inputCount = +context.customerState.CurrentRule_inputCount;
    var lexBotName = context.customerState.CurrentRule_lexBotName;
    var autoConfirm = context.customerState.CurrentRule_autoConfirm === 'true';
    var autoConfirmConfidence = +context.customerState.CurrentRule_autoConfirmConfidence;

    var lexBot = await module.exports.findLexBot(lexBotName);
    var intentResponse = await inferenceLexBot(lexBot, input, context.requestMessage.contactId);

    console.info(`NLUInput.input() Got inference response: ${JSON.stringify(intentResponse, null, 2)}`);

    var slotValue = undefined;

    if (intentResponse.intent === 'nodata')
    {
      if (!commonUtils.isEmptyString(context.customerState.CurrentRule_noInputRuleSetName))
      {
        console.info('NLUInput.input() Got nodata intent match with no input rule set name: ' + context.customerState.CurrentRule_noInputRuleSetName);

        inferenceUtils.updateStateContext(context, 'NextRuleSet', context.customerState.CurrentRule_noInputRuleSetName);
        inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_outputStateKey, undefined);

        return {
          contactId: context.requestMessage.contactId,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          dataType: context.currentRule.params.dataType,
          intent: intentResponse.intent
        };
      }
      else
      {
        console.info('NLUInput.input() Got nodata intent match but no input rule set name was not configueed, treating as a failed input');
      }
    }
    else if (intentResponse.intent === 'intentdata' &&
        !commonUtils.isNullOrUndefined(intentResponse.slots) &&
        !commonUtils.isNullOrUndefined(intentResponse.slots.dataslot) &&
        !commonUtils.isNullOrUndefined(intentResponse.slots.dataslot.value) &&
        !commonUtils.isNullOrUndefined(intentResponse.slots.dataslot.value.interpretedValue))
    {
      slotValue = intentResponse.slots.dataslot.value.interpretedValue;
      console.info(`NLUInput.input() Found interpreted value: ${slotValue}`);
    }

    if (slotValue !== undefined)
    {
      if (autoConfirm && intentResponse.confidence >= autoConfirmConfidence)
      {
        console.info(`NLUInput.input() Found high confidence intent match with auto confirm enabled`);

        inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_outputStateKey, slotValue);
        inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'confirm');
        inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'true');
        inferenceUtils.updateStateContext(context, 'CurrentRule_slotValue', slotValue);

        context.customerState.System.LastNLUInputSlot = slotValue;
        inferenceUtils.updateStateContext(context, 'System', context.customerState.System);

        var confirmationMessageTemplate = context.customerState.CurrentRule_autoConfirmMessage;
        var confirmationMessage = handlebarsUtils.template(confirmationMessageTemplate, context.customerState);

        return {
          contactId: context.requestMessage.contactId,
          message: confirmationMessage,
          inputRequired: false,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          dataType: context.currentRule.params.dataType,
          intent: intentResponse.intent,
          confidence: intentResponse.confidence,
          slots: intentResponse.slots,
          slotValue: slotValue,
          audio: await inferenceUtils.renderVoice(context.requestMessage, confirmationMessage)
        };
      }
      else
      {
        context.customerState[context.customerState.CurrentRule_outputStateKey] = slotValue;
        var confirmationMessageTemplate = context.customerState.CurrentRule_confirmationMessage;
        var confirmationMessage = handlebarsUtils.template(confirmationMessageTemplate, context.customerState);

        inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'confirm');
        inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'true');
        inferenceUtils.updateStateContext(context, 'CurrentRule_slotValue', slotValue);

        // Clear out the output state key now we have rendered the message
        inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_outputStateKey, undefined);

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          message: confirmationMessage,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          dataType: context.currentRule.params.dataType,
          intent: intentResponse.intent,
          confidence: intentResponse.confidence,
          slots: intentResponse.slots,
          slotValue: slotValue,
          audio: await inferenceUtils.renderVoice(context.requestMessage, confirmationMessage)
        };
      }
    }
    else
    {
      errorCount++;
      var errorMessage = context.customerState['CurrentRule_errorMessage' + errorCount];
      inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'false');
      inferenceUtils.updateStateContext(context, 'CurrentRule_errorCount', '' + errorCount);
      inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_outputStateKey, undefined);

      if (errorCount >= inputCount)
      {
        console.error('NLUInput.input() reached max error count');

        var errorRuleSetName = context.customerState.CurrentRule_errorRuleSetName;

        if (!commonUtils.isEmptyString(errorRuleSetName))
        {
          console.info(`NLUInput.input() found error rule set: ${errorRuleSetName}`);
          inferenceUtils.updateStateContext(context, 'NextRuleSet', errorRuleSetName);

          return {
            contactId: context.requestMessage.contactId,
            inputRequired: false,
            ruleSet: context.currentRuleSet.name,
            rule: context.currentRule.name,
            ruleType: context.currentRule.type,
            dataType: context.currentRule.params.dataType,
            message: errorMessage,
            audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
          };
        }
        else
        {
          console.error(`DTMFMenu.input() no error rule set, terminating`);

          return {
            contactId: context.requestMessage.contactId,
            inputRequired: false,
            terminate: true,
            message: errorMessage,
            ruleSet: context.currentRuleSet.name,
            rule: context.currentRule.name,
            ruleType: context.currentRule.type,
            dataType: context.currentRule.params.dataType,
            audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
          };
        }
      }
      else
      {
        console.info('NLUInput.input() prompting the customer for input again');

        errorMessage += '\n' + context.customerState.CurrentRule_offerMessage;

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          message: errorMessage,
          audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
        };
      }
    }
  }
  catch (error)
  {
    console.error('NLUInput.input() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes NLUInput confirm
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
    var slotValue = context.customerState.CurrentRule_slotValue;

    if (input === undefined || slotValue === undefined)
    {
      throw new Error('NLUInput.confirm() missing required parameters');
    }

    var lexBotName = 'yesno';
    var lexBot = await module.exports.findLexBot(lexBotName);
    var intentResponse = await inferenceLexBot(lexBot, input, context.requestMessage.contactId);

    if (intentResponse.intent === 'Yes')
    {
      console.info('NLUInput.confirm() found the Yes intent');

      // Intent is confirmed, save it and go next
      inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_outputStateKey, context.customerState.CurrentRule_slotValue);

      context.customerState.System.LastNLUInputSlot = context.customerState.CurrentRule_slotValue;
      inferenceUtils.updateStateContext(context, 'System', context.customerState.System);

      return {
        contactId: context.requestMessage.contactId,
        inputRequired: false,
        ruleSet: context.currentRuleSet.name,
        rule: context.currentRule.name,
        ruleType: context.currentRule.type,
        intent: intentResponse.intent,
        confidence: intentResponse.confidence
      };
    }
    else
    {
      console.error(`NLUInput.confirm() found non-Yes intent: ${intentResponse.intent}`);

      errorCount++;
      var errorMessage = context.customerState['CurrentRule_errorMessage' + errorCount];
      inferenceUtils.updateStateContext(context, 'CurrentRule_errorCount', '' + errorCount);

      if (errorCount >= inputCount)
      {
        console.error('NLUInput.confirm() reached max error count');

        var errorRuleSetName = context.customerState.CurrentRule_errorRuleSetName;

        if (!commonUtils.isEmptyString(errorRuleSetName))
        {
          console.info(`NLUInput.confirm() found error rule set: ${errorRuleSetName}`);
          inferenceUtils.updateStateContext(context, 'NextRuleSet', errorRuleSetName);

          return {
            contactId: context.requestMessage.contactId,
            inputRequired: false,
            ruleSet: context.currentRuleSet.name,
            rule: context.currentRule.name,
            ruleType: context.currentRule.type,
            dataType: context.currentRule.params.dataType,
            message: errorMessage,
            audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
          };
        }
        else
        {
          console.error(`NLUInput.confirm() no error rule set, terminating`);

          return {
            contactId: context.requestMessage.contactId,
            inputRequired: false,
            terminate: true,
            message: errorMessage,
            ruleSet: context.currentRuleSet.name,
            rule: context.currentRule.name,
            ruleType: context.currentRule.type,
            dataType: context.currentRule.params.dataType,
            audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
          };
        }
      }
      else
      {
        console.info('NLUInput.confirm() prompting the customer for input again');

        inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'input');
        inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'false');
        inferenceUtils.updateStateContext(context, 'CurrentRule_slotValue', undefined);

        errorMessage = context.customerState.CurrentRule_offerMessage;

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          message: errorMessage,
          audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
        };
      }
    }
  }
  catch (error)
  {
    console.error('NLUInput.confirm() failed: ' + error.message);
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
      context.customerState.CurrentRule_dataType === undefined ||
      context.customerState.CurrentRule_lexBotName === undefined ||
      context.customerState.CurrentRule_outputStateKey === undefined ||
      context.customerState.CurrentRule_offerMessage === undefined ||
      context.customerState.CurrentRule_errorMessage1 === undefined)
  {
    throw new Error('NLUInput has invalid configuration');
  }

  if (context.customerState.CurrentRule_autoConfirm === 'true'
    && commonUtils.isEmptyString(context.customerState.CurrentRule_autoConfirmMessage))
  {
    throw new Error('NLUInput auto confirm is enabled but an auto confirm message was not provided');
  }

  if (!commonUtils.isNumber(context.customerState.CurrentRule_errorCount))
  {
    throw new Error('NLUInput error count must be a number');
  }

  if (!commonUtils.isNumber(context.customerState.CurrentRule_inputCount))
  {
    throw new Error('NLUInput input count must be a number');
  }

  if (!commonUtils.isNumber(context.customerState.CurrentRule_autoConfirmConfidence))
  {
    throw new Error('NLUInput auto confirm confidence must be a number between 0.0 and 1.0');
  }

  var confidence = +context.customerState.CurrentRule_autoConfirmConfidence;

  if (confidence < 0 || confidence > 1)
  {
    throw new Error('NLUInput auto confirm confidence must be a number between 0.0 and 1.0');
  }

  var inputCount = +context.customerState.CurrentRule_inputCount;

  if (inputCount < 1 || inputCount > 3)
  {
    throw new Error('NLUInput input count must be between 1 and 3');
  }

  if (inputCount > 1 &&
      context.customerState.CurrentRule_errorMessage2 === undefined)
  {
    throw new Error('NLUInput is missing required error message 2');
  }

  if (inputCount > 2 &&
      context.customerState.CurrentRule_errorMessage3 === undefined)
  {
    throw new Error('NLUInput is missing required error message 3');
  }
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
    throw new Error('NLUInput.findLexBot() could not find Lex bot: ' + lexBotName);
  }

  console.info('Found lex bot: ' + JSON.stringify(lexBotName, null, 2));

  return lexBot;
};

/**
 * Inferences a lex bot using recognizeText()
 */
async function inferenceLexBot(lexBot, input, contactId)
{
  return await lexUtils.recognizeText(lexBot.Id, lexBot.AliasId, lexBot.LocaleId, input, contactId);
}
