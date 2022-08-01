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
 * Executes RuleSet
 */
module.exports.execute = async (context) =>
{
  try
  {
    console.info('RuleSet.execute() fired');

    if (context.requestMessage === undefined || context.customerState === undefined ||
      context.currentRuleSet === undefined || context.currentRule === undefined ||
      context.customerState.CurrentRule_ruleSetName === undefined)
    {
      throw new Error('RuleSet.execute() missing required config');
    }

    var nextRuleSet = context.customerState.CurrentRule_ruleSetName;
    var message = context.customerState.CurrentRule_message;
    var returnHere = context.customerState.CurrentRule_returnHere === 'true';

    // Save the current rule set name
    inferenceUtils.updateStateContext(context, 'NextRuleSet', nextRuleSet);

    // Push a return here rule set and rule name onto the return stack
    if (returnHere)
    {
      inferenceUtils.pushReturnStack(context.customerState.CurrentRuleSet, context.customerState.CurrentRule,
        context.customerState, context.stateToSave);
      console.info('Return stack is now: ' + JSON.stringify(context.customerState.ReturnStack, null, 2));
    }

    if (message !== undefined && message !== "")
    {
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
    else
    {
      return {
        contactId: context.requestMessage.contactId,
        inputRequired: false,
        ruleSet: context.currentRuleSet.name,
        rule: context.currentRule.name,
        ruleType: context.currentRule.type
      };
    }
  }
  catch (error)
  {
    console.error('RuleSet.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes RuleSet input
 */
module.exports.input = async (context) =>
{
  console.error('RuleSet.input() is not implemented');
  throw new Error('RuleSet.input() is not implemented');
};

/**
 * Executes RuleSet confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('RuleSet.confirm() is not implemented');
  throw new Error('RuleSet.confirm() is not implemented');
};
