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
 * Executes Message
 */
module.exports.execute = async (context) =>
{
  try
  {
    var message = context.customerState.CurrentRule_message;

    if (message === undefined ||
        message === '')
    {
      throw new Error('Message.execute() missing required config');
    }

    return {
      contactId: context.requestMessage.contactId,
      inputRequired: false,
      message: message,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type,
      audio: await inferenceUtils.renderVoice(context.requestMessage, message)
    };
  }
  catch (error)
  {
    console.error('Message.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes Message input
 */
module.exports.input = async (context) =>
{
  console.error('Message.input() is not implemented');
  throw new Error('Message.input() is not implemented');
};

/**
 * Executes Message confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('Message.confirm() is not implemented');
  throw new Error('Message.confirm() is not implemented');
};
