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
 * Executes Metric
 */
module.exports.execute = async (context) =>
{
  try
  {
    if (context.requestMessage === undefined ||
        context.customerState === undefined ||
        context.currentRuleSet === undefined ||
        context.currentRule === undefined ||
        context.customerState.CurrentRule_metricName === undefined ||
        context.customerState.CurrentRule_metricName === '' ||
        context.customerState.CurrentRule_metricValue === undefined ||
        context.customerState.CurrentRule_metricValue === '')
    {
      throw new Error('Metric.execute() missing required config');
    }

    var metricName = context.customerState.CurrentRule_metricName;
    var metricValue = context.customerState.CurrentRule_metricValue;

    return {
      contactId: context.requestMessage.contactId,
      inputRequired: false,
      message: `Metric: ${metricName} Value: ${metricValue}`,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type
    };
  }
  catch (error)
  {
    console.error('Metric.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes Metric input
 */
module.exports.input = async (context) =>
{
  console.error('Metric.input() is not implemented');
  throw new Error('Metric.input() is not implemented');
};

/**
 * Executes Metric confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('Metric.confirm() is not implemented');
  throw new Error('Metric.confirm() is not implemented');
};
