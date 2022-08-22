// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const configUtils = require('./utils/ConfigUtils');
const handlebarsUtils = require('./utils/HandlebarsUtils');
const keepWarmUtils = require('./utils/KeepWarmUtils');
const commonUtils = require('./utils/CommonUtils');
const inferenceUtils = require('./utils/InferenceUtils');
const moment = require('moment-timezone');

/**
 * Handles processing the NLU Input
 */
exports.handler = async(event, context) =>
{
  var contactId = undefined;

  try
  {
    // Check for warm up message and bail out after cache loads
    if (keepWarmUtils.isKeepWarmRequest(event))
    {
      return await keepWarmUtils.makeKeepWarmResponse(event, 0);
    }

    requestUtils.logRequest(event);

    // Grab the contact id from the event
    contactId = event.Details.ContactData.InitialContactId;

    // Load the current customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // The input slot type
    var slotType = customerState.CurrentRule_slotType;

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

    // Fetches the matched intent and slot value
    var matchedIntent = event.Details.Parameters.matchedIntent;
    var intentConfidence = event.Details.Parameters.intentConfidence;
    var slotValue = event.Details.Parameters.slotValue;
    var dataType = customerState.CurrentRule_dataType;
    var autoConfirm = customerState.CurrentRule_autoConfirm === 'true';
    var noInputRuleSetName = customerState.CurrentRule_noInputRuleSetName;
    var autoConfirmConfidence = 1.0;

    if (commonUtils.isNumber(customerState.CurrentRule_autoConfirmConfidence))
    {
      autoConfirmConfidence = +customerState.CurrentRule_autoConfirmConfidence;
    }

    var outputStateKey = customerState.CurrentRule_outputStateKey;

    if (matchedIntent === 'nodata' && !commonUtils.isEmptyString(noInputRuleSetName))
    {
      // No input path
      console.info(`[INFO] ${contactId} Got nodata intent match, directing to no input rule set: ${noInputRuleSetName}`);

      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_slotValue', undefined);
      inferenceUtils.updateState(customerState, stateToSave, outputStateKey, undefined);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validInput', 'false');
      inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', noInputRuleSetName);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessage', '');
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessageType', 'none');
      inferenceUtils.updateState(customerState, stateToSave, 'System.LastNLUInputSlot', undefined);

      // Log a payload to advise the no input path
      var logPayload = {
        EventType: 'ANALYTICS',
        EventCode: 'NLU_INPUT',
        ContactId: contactId,
        RuleSet: customerState.CurrentRuleSet,
        Rule: customerState.CurrentRule,
        When: commonUtils.nowUTCMillis(),
        DataType: dataType,
        ValidSelection: 'false',
        Intent: matchedIntent,
        Confidence: intentConfidence,
        Result: 'NOINPUT',
        Done: 'true',
        Terminate: 'false'
      };

      console.log(JSON.stringify(logPayload, null, 2));
    }
    // Check got an intent match and a valid slot
    else if (matchedIntent === 'intentdata' && slotValue !== '')
    {
      console.info(`${contactId} found slot type: ${dataType} and raw slot value: ${slotValue} with confidence: ${intentConfidence}`);

      var confidence = +intentConfidence;

      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validInput', 'true');

      // Auto confirm the match if enabled
      if (autoConfirm && intentConfidence >= autoConfirmConfidence)
      {
        // Auto accept branch
        console.info(`${contactId} auto confirming with confidence: ${intentConfidence} reaching auto confirm confidence: ${autoConfirmConfidence}`);

        // Commit the output value to state immediately saving a Lambda function call
        inferenceUtils.updateState(customerState, stateToSave, outputStateKey, slotValue);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_slotValue', slotValue);

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

        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_autoConfirmNow', 'true');
        inferenceUtils.updateState(customerState, stateToSave, 'System.LastNLUInputSlot', slotValue);

        // Log a payload to advise the auot accept of the input
        var logPayload = {
          EventType: 'ANALYTICS',
          EventCode: 'NLU_INPUT',
          ContactId: contactId,
          RuleSet: customerState.CurrentRuleSet,
          Rule: customerState.CurrentRule,
          When: commonUtils.nowUTCMillis(),
          DataType: dataType,
          ValidSelection: customerState.CurrentRule_validInput,
          Intent: matchedIntent,
          SlotValue: slotValue,
          Confidence: intentConfidence,
          Result: 'AUTO_CONFIRM',
          Done: customerState.CurrentRule_done,
          Terminate: customerState.CurrentRule_terminate
        };

        console.log(JSON.stringify(logPayload, null, 2));
      }
      else
      {
        // Manual accept branch

        // Log failures to reach auto confirm confidence
        if (autoConfirm)
        {
          console.info(`${contactId} manually confirming input with confidence: ${intentConfidence} below auto confirm confidence: ${autoConfirmConfidence}`);
        }
        // Log manual confirmations
        else
        {
          console.info(`${contactId} manually confirming input with customer`);
        }

        var yesNoBotName = `${process.env.STAGE}-${process.env.SERVICE}-yesno`;
        var lexBots = await configUtils.getLexBots(process.env.CONFIG_TABLE);
        var yesNoBot = lexBots.find((lexBot) => lexBot.Name === yesNoBotName);

        if (yesNoBot === undefined)
        {
          console.error(`${contactId} failed to locate yes no bot: ${yesNoBotName}`);
          throw new Error(`${contactId} failed to locate yes no bot: ${yesNoBotName}`);
        }

        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_slotValue', slotValue);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_yesNoBotArn', yesNoBot.Arn);

        var confirmationMessageTemplate = customerState.CurrentRule_confirmationMessage;

        // Write to the output slot in a cloned state for rendering the message
        var clonedState = commonUtils.clone(customerState);
        inferenceUtils.updateState(clonedState, new Set(), outputStateKey, slotValue);
        var confirmationMessage = handlebarsUtils.template(confirmationMessageTemplate, clonedState);
        console.info(`${contactId} made final confirmation message: ${confirmationMessage}`);

        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageFinal', confirmationMessage);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageFinalType', 'text');

        if (customerState.CurrentRule_confirmationMessageFinal.startsWith('<speak>') &&
          customerState.CurrentRule_confirmationMessageFinal.endsWith('</speak>'))
        {
          inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageFinalType', 'ssml');
        }

        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_autoConfirmNow', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'System.LastNLUInputSlot', slotValue);

        // Log a payload to advise the manually accepted status
        var logPayload = {
          EventType: 'ANALYTICS',
          EventCode: 'NLU_INPUT',
          ContactId: contactId,
          RuleSet: customerState.CurrentRuleSet,
          Rule: customerState.CurrentRule,
          When: commonUtils.nowUTCMillis(),
          DataType: dataType,
          ValidSelection: 'true',
          Intent: matchedIntent,
          SlotValue: slotValue,
          Confidence: intentConfidence,
          Result: 'MANUAL_CONFIRM',
          Done: customerState.CurrentRule_done,
          Terminate: customerState.CurrentRule_terminate
        };

        console.log(JSON.stringify(logPayload, null, 2));
      }
    }
    else
    {
      console.error(`${contactId} did not receive a slot value for data type: ${dataType}`);

      customerState.System.LastNLUInputSlot = undefined;
      stateToSave.add('System');

      var errorRuleSetName = customerState.CurrentRule_errorRuleSetName;

      // Increment the error count
      errorCount++;
      customerState.CurrentRule_errorCount = '' + errorCount;
      stateToSave.add('CurrentRule_errorCount');

      // Record that we got an invalid input so we can play the error message
      customerState.CurrentRule_validInput = 'false';
      stateToSave.add('CurrentRule_validInput');

      // Compute the next error message and type
      customerState.CurrentRule_errorMessage = customerState['CurrentRule_errorMessage' + errorCount];
      customerState.CurrentRule_errorMessageType = customerState['CurrentRule_errorMessage' + errorCount + 'Type'];
      customerState.CurrentRule_errorMessagePromptArn = customerState['CurrentRule_errorMessage' + errorCount + 'PromptArn'];
      stateToSave.add('CurrentRule_errorMessage');
      stateToSave.add('CurrentRule_errorMessageType');
      stateToSave.add('CurrentRule_errorMessagePromptArn');

      // If we haven't reached max attempts loop around so play the error and re-prompt
      if (errorCount < inputCount)
      {
        console.info(`${contactId} input attempt: ${errorCount} is less than maximum attempts: ${inputCount} playing error message and re-prompting`);

        customerState.CurrentRule_terminate = 'false';
        stateToSave.add('CurrentRule_terminate');
        customerState.CurrentRule_done = 'false';
        stateToSave.add('CurrentRule_done');

      }
      // If we have reached the maximum input attempts work out what the next step is
      else
      {
        console.info(`[${contactId} Reached maximum user input attempts: ${inputCount} computing next action`);

        // Check to see if we have a error rule set name
        if (commonUtils.isEmptyString(errorRuleSetName))
        {
          console.info(`${contactId} Found invalid input with terminate behaviour`);
          customerState.CurrentRule_done = 'true';
          stateToSave.add('CurrentRule_done');
          customerState.CurrentRule_terminate = 'true';
          stateToSave.add('CurrentRule_terminate');
        }
        else
        {
          console.info(`${contactId} Found invalid input with error ruleset: ${errorRuleSetName}`);
          customerState.NextRuleSet = errorRuleSetName;
          stateToSave.add('NextRuleSet');
          customerState.CurrentRule_done = 'true';
          stateToSave.add('CurrentRule_done');
          customerState.CurrentRule_terminate = 'false';
          stateToSave.add('CurrentRule_terminate');
        }
      }

      // Log a payload to advise the status of this menu
      var logPayload = {
        EventType: 'ANALYTICS',
        EventCode: 'NLU_INPUT',
        ContactId: contactId,
        RuleSet: customerState.CurrentRuleSet,
        Rule: customerState.CurrentRule,
        When: commonUtils.nowUTCMillis(),
        DataType: dataType,
        ValidSelection: customerState.CurrentRule_validInput,
        Intent: matchedIntent,
        SlotValue: slotValue,
        Result: 'INVALID_INPUT',
        ErrorCount: customerState.CurrentRule_errorCount,
        Done: customerState.CurrentRule_done,
        Terminate: customerState.CurrentRule_terminate
      };

      console.log(JSON.stringify(logPayload, null, 2));
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


