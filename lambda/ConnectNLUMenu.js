// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const configUtils = require('./utils/ConfigUtils');
const lexUtils = require('./utils/LexUtils');
const handlebarsUtils = require('./utils/HandlebarsUtils');
const keepWarmUtils = require('./utils/KeepWarmUtils');
const commonUtils = require('./utils/CommonUtils');
const inferenceUtils = require('./utils/InferenceUtils');
const moment = require('moment-timezone');

/**
 * Handles processing the NLU Menu
 */
exports.handler = async(event, context) =>
{
  var contactId = undefined;

  try
  {
    requestUtils.logRequest(event);

    await configUtils.checkLastChange(process.env.CONFIG_TABLE);

    // Check for warm up message and bail out after cache loads
    if (keepWarmUtils.isKeepWarmRequest(event))
    {
      return await keepWarmUtils.makeKeepWarmResponse(event, 0);
    }

    // Grab the contact id from the event
    contactId = event.Details.ContactData.InitialContactId;

    // Load the current customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // The lex bot
    var lexBotName = customerState.CurrentRule_lexBotName;

    // State to save fields
    var stateToSave = new Set();

    var errorCount = 0;
    var inputCount = 3;

    if (commonUtils.isNumber(customerState.CurrentRule_errorCount))
    {
      errorCount = +customerState.CurrentRule_errorCount;
    }

    if (commonUtils.isNumber(customerState.CurrentRule_inputCount))
    {
      inputCount = +customerState.CurrentRule_inputCount;
    }

    // Fetch the matched intent
    var matchedIntent = event.Details.Parameters.matchedIntent;

    // Parse intent confidence handling undefined if FallbackIntent
    var intentConfidence = 0.0;
    if (commonUtils.isNumber(event.Details.Parameters.intentConfidence))
    {
      intentConfidence = +event.Details.Parameters.intentConfidence;
    }

    // Check auto confirm status
    var autoConfirm = customerState.CurrentRule_autoConfirm === 'true';
    var autoConfirmMessage = customerState.CurrentRule_autoConfirmMessage;

    // Read error ruleset and output key
    var errorRuleSetName = customerState.CurrentRule_errorRuleSetName;
    var outputStateKey = customerState.CurrentRule_outputStateKey;

    // Parse auto confirm level
    var autoConfirmConfidence = 1.0;
    if (commonUtils.isNumber(customerState.CurrentRule_autoConfirmConfidence))
    {
      autoConfirmConfidence = +customerState.CurrentRule_autoConfirmConfidence;
    }

    // Logic below performs the following steps
    //
    // Check if we found an intent match
    //   Auto confirm if it is enabled and we reached threshold confidence
    //   Else prompt for yes no  via another bot
    //
    // If we did not match then increment error count
    //   If more retries left then play error prompt and refetch input
    //   No more errors
    //      If we have an error rules go there
    //      No error rule set hang up

    var configuredRuleSet = customerState['CurrentRule_intentRuleSet_' + matchedIntent];

    if (!commonUtils.isEmptyString(configuredRuleSet))
    {
      console.info(`${contactId} found configured rule set: ${configuredRuleSet} ` +
          `for intent: ${matchedIntent} with confidence: ${intentConfidence} ` +
          `with auto confirm enabled: ${autoConfirm} and ` +
          `auto confirm confidence: ${autoConfirmConfidence}`);

      if (autoConfirm && +intentConfidence >= autoConfirmConfidence)
      {
        console.info(`Auto confirming intent`);

        // Process the confirmation message
        inferenceUtils.updateState(customerState, stateToSave, outputStateKey, matchedIntent);
        inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', configuredRuleSet);
        inferenceUtils.updateState(customerState, stateToSave, 'System.LastNLUMenuIntent', matchedIntent);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validInput', 'true');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntent', matchedIntent);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntentConfidence', '' + intentConfidence);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationRequired', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_autoConfirmNow', 'true');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessage', '');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessageType', 'none');

        var confirmationMessageTemplate = customerState.CurrentRule_autoConfirmMessage;
        var confirmationMessage = handlebarsUtils.template(confirmationMessageTemplate, customerState);

        console.info(`${contactId} made final auto confirmation message: ${confirmationMessage}`);

        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageFinal', confirmationMessage);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageFinalType', 'text');

        if (customerState.CurrentRule_confirmationMessageFinal.startsWith('<speak>') &&
          customerState.CurrentRule_confirmationMessageFinal.endsWith('</speak>'))
        {
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageFinalType', 'ssml');
        }

        // Log a payload to advise we auto confirmed this intent
        var logPayload = {
          EventType: 'ANALYTICS',
          EventCode: 'NLU_MENU',
          ContactId: contactId,
          RuleSet: customerState.CurrentRuleSet,
          Rule: customerState.CurrentRule,
          When: commonUtils.nowUTCMillis(),
          LexBotName: customerState.CurrentRule_lexBotName,
          Intent: matchedIntent,
          Confidence: intentConfidence,
          ConfiguredRuleSet: configuredRuleSet,
          InputCount: inputCount,
          ErrorCount:  errorCount,
          Description: 'Auto confirmed intent',
          AutoConfirmed: 'true',
          ValidIntent: 'true',
          Done: 'true',
          Terminate: 'false'
        };

        console.log(JSON.stringify(logPayload, null, 2));
      }
      else
      {
        console.info(`${contactId} manually confirming intent`);

        var yesNoBot = await lexUtils.findLexBotBySimpleName('yesno');

        inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', undefined);
        inferenceUtils.updateState(customerState, stateToSave, 'System.LastNLUMenuIntent', undefined);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntent', matchedIntent);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntentRuleSet', configuredRuleSet);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntentConfidence', '' + intentConfidence);
        inferenceUtils.updateState(customerState, stateToSave, outputStateKey, undefined);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validInput', 'true');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationRequired', 'true');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_autoConfirmNow', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessage', '');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessageType', 'none');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_yesNoBotArn', yesNoBot.Arn);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageFinal', customerState['CurrentRule_intentConfirmationMessage_' + matchedIntent]);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageFinalType', 'text');

        if (customerState.CurrentRule_confirmationMessageFinal.startsWith('<speak>') &&
          customerState.CurrentRule_confirmationMessageFinal.endsWith('</speak>'))
        {
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageFinalType', 'ssml');
        }

        // Log a payload to advise we are manually confirming this intent
        var logPayload = {
          EventType: 'ANALYTICS',
          EventCode: 'NLU_MENU',
          ContactId: contactId,
          RuleSet: customerState.CurrentRuleSet,
          Rule: customerState.CurrentRule,
          When: commonUtils.nowUTCMillis(),
          LexBotName: customerState.CurrentRule_lexBotName,
          Intent: matchedIntent,
          Confidence: intentConfidence,
          ConfiguredRuleSet: configuredRuleSet,
          InputCount: inputCount,
          ErrorCount:  errorCount,
          Description: 'About to manually confirm intent',
          AutoConfirmed: 'false',
          ConfirmationRequired: 'true',
          ValidIntent: 'true',
          Done: 'false',
          Terminate: 'false'
        };

        console.log(JSON.stringify(logPayload, null, 2));
      }
    }
    else
    {
      errorCount++;
      console.info(`${contactId} failed to find intent match with intent: ${matchedIntent}`);

      var errorMessage = customerState['CurrentRule_errorMessage' + errorCount];
      var errorMessageType = customerState['CurrentRule_errorMessage' + errorCount + 'Type'];
      var errorMessagePromptArn = customerState['CurrentRule_errorMessage' + errorCount + 'PromptArn'];

      if (errorCount < inputCount)
      {
        console.info(`${contactId} error count: ${errorCount} is less than input count: ${inputCount} reprompting customer`);

        inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', undefined);
        inferenceUtils.updateState(customerState, stateToSave, outputStateKey, undefined);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorCount', '' + errorCount);
        inferenceUtils.updateState(customerState, stateToSave, 'System.LastNLUMenuIntent', undefined);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntent', matchedIntent);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntentConfidence', '' + intentConfidence);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validInput', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_retryInput', 'true');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationRequired', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_autoConfirmNow', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessage', errorMessage);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessageType', errorMessageType);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessagePromptArn', errorMessagePromptArn);

        // Log a payload to advise we are retrying this
        var logPayload = {
          EventType: 'ANALYTICS',
          EventCode: 'NLU_MENU',
          ContactId: contactId,
          RuleSet: customerState.CurrentRuleSet,
          Rule: customerState.CurrentRule,
          When: commonUtils.nowUTCMillis(),
          LexBotName: customerState.CurrentRule_lexBotName,
          Intent: matchedIntent,
          Confidence: intentConfidence,
          InputCount: inputCount,
          ErrorCount:  errorCount,
          Description: 'About to retry input',
          ValidIntent: 'false',
          Done: 'true',
          Terminate: 'false'
        };

        console.log(JSON.stringify(logPayload, null, 2));
      }
      else
      {
        if (commonUtils.isEmptyString(errorRuleSetName))
        {
          console.info(`${contactId} no error rule set will instruct a hangup`);

          inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', undefined);
          inferenceUtils.updateState(customerState, stateToSave, outputStateKey, undefined);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorCount', '' + errorCount);
          inferenceUtils.updateState(customerState, stateToSave, 'System.LastNLUMenuIntent', undefined);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntent', matchedIntent);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntentConfidence', '' + intentConfidence);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validInput', 'false');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_retryInput', 'false');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationRequired', 'false');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_autoConfirmNow', 'false');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'true');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessage', errorMessage);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessageType', errorMessageType);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessagePromptArn', errorMessagePromptArn);

          // Log a payload to advise we are hanging up
          var logPayload = {
            EventType: 'ANALYTICS',
            EventCode: 'NLU_MENU',
            ContactId: contactId,
            RuleSet: customerState.CurrentRuleSet,
            Rule: customerState.CurrentRule,
            When: commonUtils.nowUTCMillis(),
            LexBotName: customerState.CurrentRule_lexBotName,
            Intent: matchedIntent,
            Confidence: intentConfidence,
            InputCount: inputCount,
            ErrorCount:  errorCount,
            Description: 'About to hang up after max retries',
            ValidIntent: 'false',
            Done: 'true',
            Terminate: 'true'
          };

          console.log(JSON.stringify(logPayload, null, 2));
        }
        else
        {
          console.info(`${contactId} found error rule set at maximum inputs: ${errorRuleSetName}`);

          inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', errorRuleSetName);
          inferenceUtils.updateState(customerState, stateToSave, outputStateKey, undefined);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorCount', '' + errorCount);
          inferenceUtils.updateState(customerState, stateToSave, 'System.LastNLUMenuIntent', undefined);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntent', matchedIntent);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_matchedIntentConfidence', '' + intentConfidence);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validInput', 'false');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_retryInput', 'false');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationRequired', 'false');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_autoConfirmNow', 'false');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessage', errorMessage);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessageType', errorMessageType);
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessagePromptArn', errorMessagePromptArn);

          // Log a payload to advise we are going to the error rule set after max attempts
          var logPayload = {
            EventType: 'ANALYTICS',
            EventCode: 'NLU_MENU',
            ContactId: contactId,
            RuleSet: customerState.CurrentRuleSet,
            Rule: customerState.CurrentRule,
            When: commonUtils.nowUTCMillis(),
            LexBotName: customerState.CurrentRule_lexBotName,
            Intent: matchedIntent,
            Confidence: intentConfidence,
            ErrorRuleSet: errorRuleSetName,
            InputCount: inputCount,
            ErrorCount:  errorCount,
            Description: 'About to send to error rule set after max retries',
            ValidIntent: 'false',
            Done: 'true',
            Terminate: 'false'
          };

          console.log(JSON.stringify(logPayload, null, 2));
        }
      }
    }

    // Save the state and return it
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.error(`${contactId} Failed to process NLUInput`, error);
    throw error;
  }
};
