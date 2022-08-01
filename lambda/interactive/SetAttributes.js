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
 * Executes SetAttributes and updates the ContactAttributes in state for a customer
 * sourcing the configuration from the context.currentRule.params.setAttributes array
 */
module.exports.execute = async (context) =>
{
  try
  {
    if (context.requestMessage === undefined ||
        context.customerState === undefined ||
        context.currentRuleSet === undefined ||
        context.currentRule === undefined ||
        context.currentRule.params === undefined ||
        context.currentRule.params.setAttributes === undefined)
    {
      throw new Error('SetAttributes.execute() missing required config');
    }

    console.info('SetAttributes.execute() Got current rule: ' + JSON.stringify(context.currentRule, null, 2));

    if (context.customerState.ContactAttributes === undefined)
    {
      context.customerState.ContactAttributes = {};
    }

    context.currentRule.params.setAttributes.forEach(attribute => {

      if (inferenceUtils.isNullOrUndefined(attribute.value))
      {
        context.customerState.ContactAttributes[attribute.key] = undefined;
      }
      else
      {
        context.customerState.ContactAttributes[attribute.key] = attribute.value;
      }
    });

    // Request contact attributes to be saved
    context.stateToSave.add('ContactAttributes');

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
    console.error('SetAttributes.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes SetAttributes input
 */
module.exports.input = async (context) =>
{
  console.error('SetAttributes.input() is not implemented');
  throw new Error('SetAttributes.input() is not implemented');
};

/**
 * Executes SetAttributes confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('SetAttributes.confirm() is not implemented');
  throw new Error('SetAttributes.confirm() is not implemented');
};
