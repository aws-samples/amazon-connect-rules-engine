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

const commonUtils = require('../utils/CommonUtils');
const inferenceUtils = require('../utils/InferenceUtils');
const handlebarsUtils = require('../utils/HandlebarsUtils');

const moment = require('moment-timezone');

var maxErrorCount = 3;

/**
 * Executes DTMFInput
 */
module.exports.execute = async (context) =>
{
  try
  {
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
      audio: await inferenceUtils.renderVoice(context.requestMessage, offerMessage)
    };
  }
  catch (error)
  {
    console.error('DTMFInput.execute() failed: ' + error.message);
    throw error;
  }

};

/**
 * Executes DTMFInput input
 */
module.exports.input = async (context) =>
{
  try
  {
    validateContext(context);

    if (commonUtils.isEmptyString(context.requestMessage.input))
    {
      console.error(`DTMFInput.input() input is required`);
      throw new Error(`DTMFInput.input() input is required`);
    }

    var validInput = true;
    var input = context.requestMessage.input;
    var minLength = +context.customerState.CurrentRule_minLength;
    var maxLength = +context.customerState.CurrentRule_maxLength;
    var dataType = context.customerState.CurrentRule_dataType;
    var confirmationMessageTemplate = context.customerState.CurrentRule_confirmationMessage;
    var errorCount = +context.customerState.CurrentRule_errorCount;
    var outputStateKey = context.customerState.CurrentRule_outputStateKey;
    var errorRuleSetName = context.customerState.CurrentRule_errorRuleSetName;

    if (commonUtils.isEmptyString(confirmationMessageTemplate))
    {
      confirmationMessageTemplate = '';
    }

    if (input.length < minLength || input.length > maxLength)
    {
      console.error(`DTMFInput.input() Input: ${input} length: ${input.length} is not within min: ${minLength} and max: ${maxLength} lengths`);
      validInput = false;
    }
    else
    {
      switch (dataType)
      {
        case 'CreditCardExpiry':
        {
          if (input.length !== 4)
          {
            console.error(`DTMFInput.input() Input: ${input} length: ${input.length} not 4`);
            validInput = false;
          }
          else if (!input.match(/^[0-9]*$/))
          {
            console.error(`DTMFInput.input() Input: ${input} must be numeric`);
            validInput = false;
          }
          else
          {
            var month = +input.substring(0, 2);
            var year = '' + input.substring(2, 4);

            var fullYearNow = '' + new Date().getFullYear();
            var yearNow = fullYearNow.substring(2, 4);

            var monthNow = new Date().getMonth() + 1;

            if (month < 1 || month > 12)
            {
              console.error(`DTMFInput.input() Input: ${input} invalid month`);
              validInput = false;
            }

            if (year < yearNow)
            {
              console.error(`DTMFInput.input() Input: ${input} less than now (year)`);
              validInput = false;
            }

            if (year === yearNow && month < monthNow)
            {
              console.error(`DTMFInput.input() Input: ${input} less than now (month)`);
              validInput = false;
            }
          }
          break;
        }
        case 'Number':
        {
          if (!input.match(/^[0-9]*$/))
          {
            console.error(`DTMFInput.input() Input: ${input} is not a valid number`);
            validInput = false;
          }
          break;
        }
        case 'Phone':
        {
          if (!input.match(/^0[0-9]{9}$/))
          {
            console.error(`DTMFInput.input() Input: ${input} is not a valid number`);
            validInput = false;
          }
          break;
        }
        case 'Date':
        {
          if (!input.match(/^[0-3]{1}[0-9]{1}[0-1]{1}[0-9]{1}[1-2]{1}[0-9]{3}$/))
          {
            console.error(`DTMFInput.input() Input: ${input} is not a valid date by regex`);
            validInput = false;
          }
          else
          {
            if (!moment(input, 'DDMMYYYY', true).isValid())
            {
              console.error(`DTMFInput.input() Input: ${input} is not a valid date by parse`);
              validInput = false;
            }
          }
          break;
        }
        default:
        {
          throw new Error(`DTMFInput.input() Unhandled DTMFInput data type: ${dataType}`);
        }
      }
    }

    if (validInput)
    {
      inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'true');
      inferenceUtils.updateStateContext(context, 'CurrentRule_input', input);

      // Clone state and template the output
      var cloneState = commonUtils.clone(context.customerState);
      var tempStateKeys = new Set();
      inferenceUtils.updateState(cloneState, tempStateKeys, outputStateKey, input);
      var confirmationMessage = handlebarsUtils.template(confirmationMessageTemplate, cloneState);

      if (commonUtils.isEmptyString(confirmationMessage))
      {
        console.info(`DTMFInput.input() found empty confirmation message, setting state and skipping confirmation`)

        inferenceUtils.updateStateContext(context, outputStateKey, input);

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: false,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type
        };
      }
      else
      {
        console.info(`DTMFInput.input() found non-empty confirmation message, confirming with: ${confirmationMessage}`)

        inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'confirm');

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          message: confirmationMessage,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          audio: await inferenceUtils.renderVoice(context.requestMessage, confirmationMessage)
        };
      }
    }
    // Advise failure
    else
    {
      console.error(`DTMFInput.input() found invalid input: ${input}`);
      errorCount++;
      inferenceUtils.updateStateContext(context, 'CurrentRule_errorCount', '' + errorCount);
      inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'false');
      var errorMessage = context.customerState['CurrentRule_errorMessage' + errorCount];

      if (errorCount === maxErrorCount)
      {
        console.error('DTMFInput.input() reached max error count');

        inferenceUtils.updateStateContext(context, 'NextRuleSet', errorRuleSetName);

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: false,
          message: errorMessage,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
        };
      }
      else
      {
        console.error('DTMFInput.input() prompting the customer for input again');

        errorMessage = commonUtils.safelyMergePrompts([errorMessage, context.customerState.CurrentRule_offerMessage]);

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
    console.error('DTMFInput.input() failed: ' + error.message);
    throw error;
  }

};

/**
 * Executes DTMFInput confirm
 */
module.exports.confirm = async (context) =>
{
  try
  {
    validateContext(context);

    if (commonUtils.isEmptyString(context.requestMessage.input))
    {
      console.error(`DTMFInput.confirm() input is required`);
      throw new Error(`DTMFInput.confirm() input is required`);
    }

    var input = context.requestMessage.input;
    var errorCount = +context.customerState.CurrentRule_errorCount;
    var offerMessage = context.customerState.CurrentRule_offerMessage;
    var outputStateKey = context.customerState.CurrentRule_outputStateKey;
    var errorRuleSetName = context.customerState.CurrentRule_errorRuleSetName;

    if (input === '1')
    {
      // Input is confirmed, save it to state and fall through
      inferenceUtils.updateStateContext(context, outputStateKey, context.customerState.CurrentRule_input);

      return {
        contactId: context.requestMessage.contactId,
        inputRequired: false,
        ruleSet: context.currentRuleSet.name,
        rule: context.currentRule.name,
        ruleType: context.currentRule.type
      };
    }
    else
    {
      console.error(`DTMFInput.confirm() customer pressed something other than 1: ${input}`);
      errorCount++;
      inferenceUtils.updateStateContext(context, 'CurrentRule_errorCount', '' + errorCount);
      var errorMessage = context.customerState['CurrentRule_errorMessage' + errorCount];

      if (errorCount === maxErrorCount)
      {
        console.error('DTMFInput.confirm() reached max error count');
        inferenceUtils.updateStateContext(context, 'NextRuleSet', errorRuleSetName);

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: false,
          message: errorMessage,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
        };
      }
      else
      {
        console.error('DTMFInput.confirm() prompting the customer for input again');

        // Return to input phase
        inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'input');
        inferenceUtils.updateStateContext(context, 'CurrentRule_input', undefined);
        inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', undefined);

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          message: offerMessage,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          audio: await inferenceUtils.renderVoice(context.requestMessage, offerMessage)
        };
      }
    }
  }
  catch (error)
  {
    console.error('DTMFInput.confirm() failed: ' + error.message);
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
      commonUtils.isEmptyString(context.currentRuleSet) ||
      commonUtils.isEmptyString(context.currentRule) ||
      commonUtils.isEmptyString(context.customerState.CurrentRule_offerMessage) ||
      commonUtils.isEmptyString(context.customerState.CurrentRule_outputStateKey) ||
      commonUtils.isEmptyString(context.customerState.CurrentRule_errorRuleSetName) ||
      commonUtils.isEmptyString(context.customerState.CurrentRule_errorCount) ||
      commonUtils.isEmptyString(context.customerState.CurrentRule_dataType) ||
      commonUtils.isEmptyString(context.customerState.CurrentRule_minLength) ||
      commonUtils.isEmptyString(context.customerState.CurrentRule_maxLength))
  {
    throw new Error('DTMFInput.validateContext() missing required config');
  }
}
