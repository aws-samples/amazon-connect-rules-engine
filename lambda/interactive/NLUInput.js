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
var dynamoUtils = require('../utils/DynamoUtils');
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

    var dataType = context.customerState.CurrentRule_dataType;
    var offerMessage = context.customerState.CurrentRule_offerMessage;
    var outputStateKey = context.customerState.CurrentRule_outputStateKey;

    // Clear out the last output state
    inferenceUtils.updateStateContext(context, 'System.LastNLUInputSlot', undefined);
    inferenceUtils.updateStateContext(context, outputStateKey, undefined);
    inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'input');

    return {
      contactId: context.requestMessage.contactId,
      message: offerMessage,
      inputRequired: true,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type,
      dataType: dataType,
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
    var outputStateKey = context.customerState.CurrentRule_outputStateKey;
    var dataType = context.customerState.CurrentRule_dataType;
    var errorCount = +context.customerState.CurrentRule_errorCount;
    var inputCount = +context.customerState.CurrentRule_inputCount;
    var lexBotName = context.customerState.CurrentRule_lexBotName;
    var autoConfirm = context.customerState.CurrentRule_autoConfirm === 'true';
    var autoConfirmConfidence = +context.customerState.CurrentRule_autoConfirmConfidence;

    // Clear out the last output state
    inferenceUtils.updateStateContext(context, 'System.LastNLUInputSlot', undefined);
    inferenceUtils.updateStateContext(context, outputStateKey, undefined);

    var lexBot = await lexUtils.findLexBotBySimpleName(lexBotName);
    var intentResponse = undefined;

    // If we get NOINPUT return the nodata
    if (input === 'NOINPUT')
    {
      console.info(`NLUInput.input() found NOINPUT, forcing nodata intent`);
      intentResponse = makeNoDataResponse(1.0);
    }
    // If we get no match return the fallback intent
    else if (input === 'NOMATCH')
    {
      console.info(`NLUInput.input() found NOMATCH, forcing fallback intent`);
      intentResponse = makeFallBackResponse();
    }
    else
    {
      console.info(`NLUInput.input() found valid input, inferencing bot`);
      intentResponse = await lexUtils.recognizeText(
        lexBot.Id,
        lexBot.AliasId,
        lexBot.LocaleId,
        input,
        context.requestMessage.contactId);
    }

    console.info(`NLUInput.input() Got inference response: ${JSON.stringify(intentResponse, null, 2)}`);

    var slotValue = undefined;

    // Clamping nodata intent confidence to 0.85 to avoid false matches
    if (intentResponse.intent === 'nodata' && intentResponse.confidence >= 0.85)
    {
      if (!commonUtils.isEmptyString(context.customerState.CurrentRule_noInputRuleSetName))
      {
        console.info('NLUInput.input() Got high confidence nodata intent match with no input rule set name: ' + context.customerState.CurrentRule_noInputRuleSetName);

        inferenceUtils.updateStateContext(context, 'NextRuleSet', context.customerState.CurrentRule_noInputRuleSetName);
        inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_outputStateKey, undefined);

        return {
          contactId: context.requestMessage.contactId,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          dataType: dataType,
          lexResponse: intentResponse.lexResponse
        };
      }
      else
      {
        console.info('NLUInput.input() Got nodata intent match but no input rule set name was not configured, treating as a failed input');
      }
    }
    // Handle expanding phone number slots to handle Australianisms
    else if (dataType ==='phone' &&
            intentResponse.intent === 'intentdata')
    {
      slotValue = lexUtils.expandPhoneNumber(input);
      intentResponse.slots.dataslot.value.overrideValue = slotValue;
      console.info(`NLUInput.input() Using expanded phone number: ${slotValue}`);
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

    // Validate the slot value, removing the detected value on validation failure
    if (!validateSlot(context.customerState, dataType, slotValue))
    {
      console.info(`Failing validation on slot value: ${slotValue}`);
      slotValue = undefined;
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
          dataType: dataType,
          lexResponse: intentResponse.lexResponse,
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
          dataType: dataType,
          lexResponse: intentResponse.lexResponse,
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
            dataType: dataType,
            message: errorMessage,
            lexResponse: intentResponse.lexResponse,
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
            dataType: dataType,
            lexResponse: intentResponse.lexResponse,
            audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
          };
        }
      }
      else
      {
        console.info('NLUInput.input() prompting the customer for input again');

        errorMessage = commonUtils.safelyMergePrompts([errorMessage, context.customerState.CurrentRule_offerMessage]);

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          dataType: dataType,
          message: errorMessage,
          lexResponse: intentResponse.lexResponse,
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

    var dataType = context.customerState.CurrentRule_dataType;
    var errorCount = +context.customerState.CurrentRule_errorCount;
    var inputCount = +context.customerState.CurrentRule_inputCount;

    var input = context.requestMessage.input;
    var slotValue = context.customerState.CurrentRule_slotValue;

    if (input === undefined || slotValue === undefined)
    {
      throw new Error('NLUInput.confirm() missing required parameters');
    }

    var lexBotName = 'yesno';
    var lexBot = await lexUtils.findLexBotBySimpleName(lexBotName);
    var intentResponse = await lexUtils.recognizeText(
      lexBot.Id,
      lexBot.AliasId,
      lexBot.LocaleId,
      input,
      context.requestMessage.contactId);

    if (intentResponse.intent === 'Yes')
    {
      console.info('NLUInput.confirm() found the Yes intent');

      // Intent is confirmed, save it and go next
      inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_outputStateKey, slotValue);
      inferenceUtils.updateStateContext(context, 'System.LastNLUInputSlot', slotValue);

      return {
        contactId: context.requestMessage.contactId,
        inputRequired: false,
        ruleSet: context.currentRuleSet.name,
        rule: context.currentRule.name,
        ruleType: context.currentRule.type,
        dataType: dataType,
        lexResponse: intentResponse.lexResponse
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
            dataType: dataType,
            message: errorMessage,
            lexResponse: intentResponse.lexResponse,
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
            dataType: dataType,
            lexResponse: intentResponse.lexResponse,
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
          dataType: dataType,
          message: errorMessage,
          lexResponse: intentResponse.lexResponse,
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
 * Makes a fall back response for NOMATCH inputs
 */
function makeFallBackResponse()
{
  return {
    intent: 'FallbackIntent'
  };
}

/**
 * Makes a nodata intent match for NOINPUT inputs
 */

function makeNoDataResponse(confidence)
{
  return {
    intent: 'nodata',
    confidence: confidence
  };
}

/**
 * Perform data type specific validation
 */
function validateSlot(customerState, dataType, slotValue)
{
  var minValue = customerState.CurrentRule_minValue;
  var maxValue = customerState.CurrentRule_maxValue;

  switch (dataType)
  {
    case 'date':
    {
      return inferenceUtils.validateSlotDate(slotValue, minValue, maxValue);
    }
    case 'number':
    {
      return inferenceUtils.validateSlotNumber(slotValue, minValue, maxValue);
    }
    case 'phone':
    {
      return inferenceUtils.validateSlotPhone(slotValue, minValue, maxValue);
    }
    case 'time':
    {
      return inferenceUtils.validateSlotTime(slotValue, minValue, maxValue);
    }
    default:
    {
      throw new Error('Unsupported data type: ' + dataType);
    }
  }
}
