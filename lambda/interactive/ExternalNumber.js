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
 * Executes ExternalNumber
 */
module.exports.execute = async (context) =>
{
  try
  {
    if (context.requestMessage === undefined ||
        context.customerState === undefined ||
        context.currentRuleSet === undefined ||
        context.currentRule === undefined ||
        context.customerState.CurrentRule_externalNumber === undefined)
    {
      throw new Error('ExternalNumber.execute() missing required config');
    }

    var externalNumber = context.customerState.CurrentRule_externalNumber;

    var response = {
      contactId: context.requestMessage.contactId,
      inputRequired: false,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type,
      externalNumber: externalNumber
    };

    return response;
  }
  catch (error)
  {
    console.error('ExternalNumber.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes ExternalNumber input
 */
module.exports.input = async (context) =>
{
  console.error('ExternalNumber.input() is not implemented');
  throw new Error('ExternalNumber.input() is not implemented');
};

/**
 * Executes ExternalNumber confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('ExternalNumber.confirm() is not implemented');
  throw new Error('ExternalNumber.confirm() is not implemented');
};
