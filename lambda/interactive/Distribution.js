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
 * Executes Distribution
 */
module.exports.execute = async (context) =>
{
  try
  {
    console.info('Distribution.execute() fired');

    if (context.requestMessage === undefined || context.customerState === undefined ||
      context.currentRuleSet === undefined || context.currentRule === undefined)
    {
      throw new Error('Distribution.execute() missing required config');
    }

    var nextRuleSet = inferenceUtils.solveDistribution(context.customerState);

    // Save the current rule set name
    inferenceUtils.updateStateContext(context, 'NextRuleSet', nextRuleSet);

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
    console.error('Distribution.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes Distribution input
 */
module.exports.input = async (context) =>
{
  console.error('Distribution.input() is not implemented');
  throw new Error('Distribution.input() is not implemented');
};

/**
 * Executes Distribution confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('Distribution.confirm() is not implemented');
  throw new Error('Distribution.confirm() is not implemented');
};
