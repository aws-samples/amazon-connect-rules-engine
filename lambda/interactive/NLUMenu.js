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
var lexUtils = require('../utils/LexUtils.js');
var configUtils = require('../utils/ConfigUtils.js');

var maxErrorCount = 2;

/**
 * Executes NLUMenu
 */
module.exports.execute = async (context) =>
{
  try
  {
    var offerMessage = context.customerState.CurrentRule_offerMessage;
    var errorCountStr = context.customerState.CurrentRule_errorCount;

    if (offerMessage === undefined || errorCountStr === undefined)
    {
      throw new Error('NLUMenu.execute() missing required config');
    }

    inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'input');

    return {
      contactId: context.requestMessage.contactId,
      message: offerMessage,
      inputRequired: true,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type,
      audio: await inferenceUtils.renderVoice(context.requestMessage, offerMessage)
    };
  }
  catch (error)
  {
    console.error('NLUMenu.execute() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes NLUMenu input.
 * This attempts to inference the configured lex bot
 * and determine the selected intent.
 */
module.exports.input = async (context) =>
{
  try
  {
    var input = context.requestMessage.input;
    var lexBotName = context.customerState.CurrentRule_lexBotName;
    var errorCountStr = context.customerState.CurrentRule_errorCount;

    if (input === undefined || lexBotName === undefined || errorCountStr === undefined)
    {
      throw new Error('NLUMenu.input() missing required config');
    }

    var errorCount = +errorCountStr;
    var lexBot = await module.exports.findLexBot(lexBotName);
    var intentResponse = await inferenceLexBot(lexBot, input);
    var confirmationMessage = context.customerState['CurrentRule_intentConfirmationMessage_' + intentResponse.intent];
    var nextRuleSet = context.customerState['CurrentRule_intentRuleSet_' + intentResponse.intent];
    var alwaysConfirm = true;

    if (context.customerState['CurrentRule_alwaysConfirm'] === 'false')
    {
      alwaysConfirm = false;
    }

    if (nextRuleSet !== undefined && confirmationMessage !== undefined)
    {
      console.info(`NLUMenu.input() matched valid NLUMenu intent: ${intentResponse.intent}`);

      // Move the phase to confirm and store the intent and intentRuleSet for after the confirm phase
      inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'confirm');
      inferenceUtils.updateStateContext(context, 'CurrentRule_intent', intentResponse.intent);
      inferenceUtils.updateStateContext(context, 'CurrentRule_intentRuleSet', nextRuleSet);

      // If always confirm is disabled then just confirm it
      if (!alwaysConfirm)
      {
        console.info(`NLUMenu.input() always confirm is disabled, confirming intent: ${intentResponse.intent}`);

        // Intent is confirmed, save it and go to the next rules set
        inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_intentOutputKey, context.customerState.CurrentRule_intent);
        inferenceUtils.updateStateContext(context, 'NextRuleSet', context.customerState.CurrentRule_intentRuleSet);

        confirmationMessage = context.customerState['CurrentRule_autoConfirmMessage'];

        return {
          contactId: context.requestMessage.contactId,
          message: confirmationMessage,
          inputRequired: false,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          intent: intentResponse.intent,
          confidence: intentResponse.confidence,
          slots: intentResponse.slots,
          audio: await inferenceUtils.renderVoice(context.requestMessage, confirmationMessage)
        };
      }

      return {
        contactId: context.requestMessage.contactId,
        inputRequired: true,
        message: confirmationMessage,
        ruleSet: context.currentRuleSet.name,
        rule: context.currentRule.name,
        ruleType: context.currentRule.type,
        intent: intentResponse.intent,
        confidence: intentResponse.confidence,
        slots: intentResponse.slots,
        audio: await inferenceUtils.renderVoice(context.requestMessage, confirmationMessage)
      };
    }
    else
    {
      console.error(`NLUMenu.input() found unmatched intent: ${intentResponse.intent}`);

      errorCount++;
      var errorMessage = context.customerState['CurrentRule_errorMessage' + errorCount];
      inferenceUtils.updateStateContext(context, 'CurrentRule_errorCount', '' + errorCount);

      if (errorCount === maxErrorCount)
      {
        console.error('NLUMenu.input() reached max error count');
        inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_errorOutputKey, 'true');

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: false,
          message: errorMessage,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          intent: intentResponse.intent,
          confidence: intentResponse.confidence,
          audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
        };
      }
      else
      {
        console.error('NLUMenu.input() prompting the customer for input again');

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          message: errorMessage,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          intent: intentResponse.intent,
          confidence: intentResponse.confidence,
          audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
        };
      }
    }
  }
  catch (error)
  {
    console.error('NLUMenu.input() failed: ' + error.message);
    throw error;
  }
};

/**
 * Executes NLUMenu confirm
 */
module.exports.confirm = async (context) =>
{
  try
  {
    var input = context.requestMessage.input;
    var errorCountStr = context.customerState.CurrentRule_errorCount;
    var existingIntent = context.customerState.CurrentRule_intent;
    var existingIntentRuleSet = context.customerState.CurrentRule_intentRuleSet;

    if (input === undefined || errorCountStr === undefined ||
        existingIntent === undefined || existingIntentRuleSet === undefined)
    {
      throw new Error('NLUMenu.confirm() missing required config');
    }

    var errorCount = +errorCountStr;
    var lexBotName = 'yesno';
    var lexBot = await module.exports.findLexBot(lexBotName);
    var intentResponse = await inferenceLexBot(lexBot, input);

    if (intentResponse.intent === 'Yes')
    {
      console.info('NLUMenu.confirm() found the Yes intent');

      // Intent is confirmed, save it and go to the next rules set
      inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_intentOutputKey, context.customerState.CurrentRule_intent);
      inferenceUtils.updateStateContext(context, 'NextRuleSet', context.customerState.CurrentRule_intentRuleSet);

      return {
        contactId: context.requestMessage.contactId,
        inputRequired: false,
        ruleSet: context.currentRuleSet.name,
        rule: context.currentRule.name,
        ruleType: context.currentRule.type,
        intent: intentResponse.intent,
        confidence: intentResponse.confidence
      };
    }
    else
    {
      console.error(`NLUMenu.confirm() found non-Yes intent: ${intentResponse.intent}`);

      errorCount++;
      var errorMessage = context.customerState['CurrentRule_errorMessage' + errorCount];
      inferenceUtils.updateStateContext(context, 'CurrentRule_errorCount', '' + errorCount);

      if (errorCount === maxErrorCount)
      {
        console.error('NLUMenu.confirm() reached max error count');
        inferenceUtils.updateStateContext(context, context.customerState.CurrentRule_errorOutputKey, 'true');

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: false,
          message: errorMessage,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          intent: intentResponse.intent,
          confidence: intentResponse.confidence,
          audio: await inferenceUtils.renderVoice(context.requestMessage, errorMessage)
        };
      }
      else
      {
        console.error('NLUMenu.confirm() prompting the customer for input again');

        // Return to input phase
        inferenceUtils.updateStateContext(context, 'CurrentRule_phase', 'input');
        inferenceUtils.updateStateContext(context, 'CurrentRule_intent', undefined);
        inferenceUtils.updateStateContext(context, 'CurrentRule_intentRuleSet', undefined);

        return {
          contactId: context.requestMessage.contactId,
          inputRequired: true,
          message: context.customerState.CurrentRule_offerMessage,
          ruleSet: context.currentRuleSet.name,
          rule: context.currentRule.name,
          ruleType: context.currentRule.type,
          intent: intentResponse.intent,
          confidence: intentResponse.confidence,
          audio: await inferenceUtils.renderVoice(context.requestMessage, context.customerState.CurrentRule_offerMessage)
        };
      }
    }
  }
  catch (error)
  {
    console.error('NLUMenu.confirm() failed: ' + error.message);
    throw error;
  }

};

/**
 * Locates a lex bot by simple name or throws
 */
module.exports.findLexBot = async (lexBotName) =>
{
  var lexBots = await configUtils.getLexBots(process.env.CONFIG_TABLE);
  var lexBot = lexBots.find(lexBot => lexBot.SimpleName === lexBotName);

  if (lexBot === undefined)
  {
    throw new Error('NLUMenu.findLexBot() could not find Lex bot: ' + lexBotName);
  }

  return lexBot;
};

/**
 * Inferences a lex bot using recognizeText()
 */
async function inferenceLexBot(lexBot, input)
{
  return await lexUtils.recognizeText(lexBot.Id, lexBot.AliasId, lexBot.LocaleId, input);
}
