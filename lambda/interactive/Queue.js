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
 * Executes Queue
 * TODO handle hours of operation
 */
module.exports.execute = async (context) =>
{
  try
  {
    if (context.requestMessage === undefined ||
        context.customerState === undefined ||
        context.currentRuleSet === undefined ||
        context.currentRule === undefined ||
        context.customerState.CurrentRule_queueName === undefined)
    {
      throw new Error('Queue.execute() missing required config');
    }

    var queueName = context.customerState.CurrentRule_queueName;
    var message = context.customerState.CurrentRule_message;

    var response = {
      contactId: context.requestMessage.contactId,
      inputRequired: false,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type,
      queue: queueName
    };

    if (message !== undefined && message !== '')
    {
      response.message = message;
      response.audio = await inferenceUtils.renderVoice(context.requestMessage, message);
    }

    return response;
  }
  catch (error)
  {
    console.error('Queue.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes Queue input
 */
module.exports.input = async (context) =>
{
  console.error('Queue.input() is not implemented');
  throw new Error('Queue.input() is not implemented');
};

/**
 * Executes Queue confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('Queue.confirm() is not implemented');
  throw new Error('Queue.confirm() is not implemented');
};
