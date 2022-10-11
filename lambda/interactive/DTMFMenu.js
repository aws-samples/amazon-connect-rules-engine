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

const inferenceUtils = require('../utils/InferenceUtils');
const commonUtils = require('../utils/CommonUtils');

/**
 * Executes DTMFMenu
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
      audio: await inferenceUtils.renderVoice(context.requestMessage, offerMessage)
    };
  }
  catch (error)
  {
    console.error('DTMFMenu.execute() failed: ' + error.message);
    throw error;
  }

};

/**
 * Executes DTMFMenu input
 */
module.exports.input = async (context) =>
{
  try
  {
    // Perform context validation
    validateContext(context);

    if (context.requestMessage.input === undefined)
    {
      throw new Error('DTMFMenu.input() missing input');
    }

    var input = context.requestMessage.input;

    var errorCount = 0;

    if (commonUtils.isNumber(context.customerState.CurrentRule_errorCount))
    {
      errorCount = +context.customerState.CurrentRule_errorCount;
    }

    var inputCount = +context.customerState.CurrentRule_inputCount;

    var nextRuleSet = context.customerState['CurrentRule_dtmf' + input];

    if (nextRuleSet !== undefined)
    {
      console.info(`DTMFMenu.input() found input: ${input} matched with next rule set: ${nextRuleSet}`);

      context.customerState.System.LastSelectedDTMF = input
      inferenceUtils.updateStateContext(context, 'NextRuleSet', nextRuleSet);
      inferenceUtils.updateStateContext(context, 'System', context.customerState.System);
      inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'true');

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
      console.info(`DTMFMenu.input() found unmatched input: ${input}`);

      errorCount++;
      inferenceUtils.updateStateContext(context, 'CurrentRule_errorCount', '' + errorCount);
      inferenceUtils.updateStateContext(context, 'CurrentRule_validInput', 'false');

      var errorMessage = context.customerState['CurrentRule_errorMessage' + errorCount];

      if (errorCount === inputCount)
      {
        console.error('DTMFMenu.input() reached max error count');

        var errorRuleSetName = context.customerState.CurrentRule_errorRuleSetName;

        // Check to see if this is NOINPUT
        if (input === 'NOINPUT')
        {
          errorRuleSetName = context.customerState.CurrentRule_noInputRuleSetName;
          console.info('DTMFMenu.input() detected no input');
        }

        if (errorRuleSetName !== undefined && errorRuleSetName !== '')
        {
          console.info(`DTMFMenu.input() found error rule set: ${errorRuleSetName}`);
          inferenceUtils.updateStateContext(context, 'NextRuleSet', errorRuleSetName);

          return {
            contactId: context.requestMessage.contactId,
            inputRequired: false,
            ruleSet: context.currentRuleSet.name,
            rule: context.currentRule.name,
            ruleType: context.currentRule.type,
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
            audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
          };
        }
      }
      else
      {
        console.info('DTMFMenu.input() prompting the customer for input again');

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
    console.error('DTMFMenu.input() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes DTMFMenu confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('DTMFMenu.confirm() is not implemented');
  throw new Error('DTMFMenu.confirm() is not implemented');
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
      context.customerState.CurrentRule_inputCount === undefined ||
      context.customerState.CurrentRule_offerMessage === undefined ||
      context.customerState.CurrentRule_errorMessage1 === undefined)
  {
    throw new Error('DTMFMenu has invalid configuration');
  }

  var inputCount = +context.customerState.CurrentRule_inputCount;

  if (inputCount > 1 &&
      context.customerState.CurrentRule_errorMessage2 === undefined)
  {
    throw new Error('DTMFMenu is missing required error message 2');
  }

  if (inputCount > 2 &&
      context.customerState.CurrentRule_errorMessage3 === undefined)
  {
    throw new Error('DTMFMenu is missing required error message 3');
  }
}
