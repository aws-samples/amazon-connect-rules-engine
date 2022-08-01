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

var inferenceUtils = require('./utils/InferenceUtils.js');

/**
 * Executes NLUMenu
 */
module.exports.execute = async (context) =>
{
  try
  {
    console.info('NLUMenu.execute() fired');
  }
  catch (error)
  {
    console.error('NLUMenu.execute() failed', error);
    throw error;
  }
};

/**
 * Executes NLUMenu input
 */
module.exports.input = async (context) =>
{
  console.error('NLUMenu.input() is not implemented');
  throw new Error('NLUMenu.input() is not implemented');
};

/**
 * Executes NLUMenu confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('NLUMenu.confirm() is not implemented');
  throw new Error('NLUMenu.confirm() is not implemented');
};
