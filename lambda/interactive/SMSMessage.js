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

var inferenceUtils = require('../utils/InferenceUtils.js');

/**
 * Executes SMSMessage
 */
module.exports.execute = async (context) =>
{
  try
  {
    if (context.requestMessage === undefined ||
        context.customerState === undefined ||
        context.currentRuleSet === undefined ||
        context.currentRule === undefined ||
        context.customerState.CurrentRule_message === undefined ||
        context.customerState.CurrentRule_phoneNumberKey === undefined)
    {
      throw new Error('SMSMessage.execute() missing required config');
    }

    // Phone number to use is in state keyed by CurrentRule_phoneNumberKey
    var message = context.customerState.CurrentRule_message;
    var phoneNumberKey = context.customerState.CurrentRule_phoneNumberKey;
    var phoneNumber = context.customerState[phoneNumberKey];

    if (phoneNumber === undefined)
    {
      throw new Error('SMSMessage.execute() could not locate phone number with state key: ' + phoneNumberKey);
    }

    return {
      contactId: context.requestMessage.contactId,
      inputRequired: false,
      message: `SMS: ${phoneNumber} Message: ${message}`,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type
    };
  }
  catch (error)
  {
    console.error('SMSMessage.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes SMSMessage input
 */
module.exports.input = async (context) =>
{
  console.error('SMSMessage.input() is not implemented');
  throw new Error('SMSMessage.input() is not implemented');
};

/**
 * Executes SMSMessage confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('SMSMessage.confirm() is not implemented');
  throw new Error('SMSMessage.confirm() is not implemented');
};
