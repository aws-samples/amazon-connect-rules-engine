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
 * Executes UpdateStates
 */
module.exports.execute = async (context) =>
{
  try
  {
    if (context.requestMessage === undefined ||
        context.customerState === undefined ||
        context.currentRuleSet === undefined ||
        context.currentRule === undefined ||
        context.customerState.CurrentRule_updateStates === undefined ||
        !Array.isArray(context.customerState.CurrentRule_updateStates) ||
        context.customerState.CurrentRule_updateStates.length === 0)
    {
      throw new Error('UpdateStates.execute() missing required config');
    }

    for (var i = 0; i < context.customerState.CurrentRule_updateStates.length; i++)
    {
      var stateKey = context.customerState.CurrentRule_updateStates[i].key;
      var stateValue = context.customerState.CurrentRule_updateStates[i].value;

      if (stateValue === 'increment')
      {
        // Look in the customer state and try and safely increment
        var existingValue = context.customerState[stateKey];

        if (!commonUtils.isNumber(existingValue))
        {
          stateValue = '1';
        }
        else
        {
          stateValue = '' + (+existingValue + 1);
        }
      }

      inferenceUtils.updateStateContext(context, stateKey, stateValue);
    }

    return {
      contactId: context.requestMessage.contactId,
      inputRequired: false,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type
    };
  }
  catch (error)
  {
    console.error('UpdateStates.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes UpdateStates input
 */
module.exports.input = async (context) =>
{
  console.error('UpdateStates.input() is not implemented');
  throw new Error('UpdateStates.input() is not implemented');
};

/**
 * Executes UpdateStates confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('UpdateStates.confirm() is not implemented');
  throw new Error('UpdateStates.confirm() is not implemented');
};
