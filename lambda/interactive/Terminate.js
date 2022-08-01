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
 * Executes Terminate
 */
module.exports.execute = async (context) =>
{
  try
  {
    if (context.requestMessage === undefined ||
        context.customerState === undefined ||
        context.currentRuleSet === undefined ||
        context.currentRule === undefined)
    {
      throw new Error('Terminate.execute() missing required config');
    }

    return {
      contactId: context.requestMessage.contactId,
      inputRequired: false,
      terminate: true,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type
    };
  }
  catch (error)
  {
    console.error('Terminate.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes Terminate input
 */
module.exports.input = async (context) =>
{
  console.error('Terminate.input() is not implemented');
  throw new Error('Terminate.input() is not implemented');
};

/**
 * Executes Terminate confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('Terminate.confirm() is not implemented');
  throw new Error('Terminate.confirm() is not implemented');
};
