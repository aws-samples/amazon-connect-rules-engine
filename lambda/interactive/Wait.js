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
 * Executes Wait
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
      message: `Wait: Waiting for customer input or NOINPUT`,
      inputRequired: true,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type
    };
  }
  catch (error)
  {
    console.error('Wait.execute() failed: ' + error.message);
    throw error;
  }

};

/**
 * Executes Wait input
 */
module.exports.input = async (context) =>
{
  try
  {
    // Perform context validation
    validateContext(context);

    if (context.requestMessage.input === undefined)
    {
      throw new Error('Wait.input() missing input');
    }

    var input = context.requestMessage.input;

    var nextRuleSet = context.customerState.CurrentRule_ruleSetName;

    if (input === 'NOINPUT')
    {
      console.info('Wait.input() found NOINPUT, simulating a timeout and continuing to the next rule');
    }
    else
    {
      console.info('Wait.input() found input from customer, going to next ruleset: ' + nextRuleSet);
      inferenceUtils.updateStateContext(context, 'NextRuleSet', nextRuleSet);
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
    console.error('Wait.input() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes DTMFMenu confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('Wait.confirm() is not implemented');
  throw new Error('Wait.confirm() is not implemented');
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
      context.customerState.CurrentRule_ruleSetName === undefined ||
      context.customerState.CurrentRule_waitTimeSeconds === undefined)
  {
    throw new Error('Wait has invalid configuration');
  }
}
