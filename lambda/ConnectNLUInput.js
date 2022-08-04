// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils');
var dynamoUtils = require('./utils/DynamoUtils');
var configUtils = require('./utils/ConfigUtils');
var handlebarsUtils = require('./utils/HandlebarsUtils');

var moment = require('moment-timezone');

/**
 * Handles processing the NLU Input
 */
exports.handler = async(event, context) =>
{
  var contactId = undefined;

  try
  {
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

    if (isNumber(customerState.CurrentRule_errorCount))
    {
      errorCount = +customerState.CurrentRule_errorCount;
    }

    if (isNumber(customerState.CurrentRule_inputCount))
    {
      inputCount = +customerState.CurrentRule_inputCount;
    }

    // Fetches the matched intent and slot value
    var matchedIntent = event.Details.Parameters.matchedIntent;
    var intentConfidence = event.Details.Parameters.intentConfidence;
    var slotValue = event.Details.Parameters.slotValue;
    var dataType = customerState.CurrentRule_dataType;
    var autoConfirm = customerState.CurrentRule_autoConfirm === 'true';

    var outputStateKey = customerState.CurrentRule_outputStateKey;

    // Check got an intent match and a valid slot
    if (matchedIntent === 'intentdata' && slotValue !== '')
    {
      console.log(`[INFO] ${contactId} found slot type: ${dataType} and raw slot value: ${slotValue} with confidence: ${intentConfidence}`);

      var confidence = +intentConfidence;

      customerState[outputStateKey] = slotValue;

      // Auto confirm this
      if (intentConfidence > 0.9999 && autoConfirm)
      {
        // Commit the output value to state immediately saving a Lambda function call
        stateToSave.add(outputStateKey);

        var confirmationMessageTemplate = customerState.CurrentRule_autoConfirmMessage;

        console.info(`Got confirmation message template: ${confirmationMessageTemplate}`);
        var confirmationMessage = handlebarsUtils.template(confirmationMessageTemplate, customerState);
        console.info(`Got final confirmation message: ${confirmationMessage}`);

        customerState.CurrentRule_confirmationMessageFinal = confirmationMessage;
        customerState.CurrentRule_confirmationMessageFinalType = 'text';

        if (confirmationMessage.startsWith('<speak>') && confirmationMessage.endsWith('</speak>'))
        {
          customerState.CurrentRule_confirmationMessageFinalType = 'ssml';
        }

        stateToSave.add('CurrentRule_confirmationMessageFinal');
        stateToSave.add('CurrentRule_confirmationMessageFinalType');
      }
      else
      {
        var yesNoBotName = `${process.env.STAGE}-${process.env.SERVICE}-yesno`;
        var lexBots = await configUtils.getLexBots(process.env.CONFIG_TABLE);
        var yesNoBot = lexBots.find((lexBot) => lexBot.Name === yesNoBotName);

        if (yesNoBot === undefined)
        {
          throw new Error('Failed to locate yes no bot: ' + yesNoBotName);
        }

        customerState.CurrentRule_yesNoBotArn = yesNoBot.Arn
        stateToSave.add('CurrentRule_yesNoBotArn');

        var confirmationMessageTemplate = customerState.CurrentRule_confirmationMessage;
        var confirmationMessage = handlebarsUtils.template(confirmationMessageTemplate, customerState);

        customerState.CurrentRule_confirmationMessageFinal = confirmationMessage;
        customerState.CurrentRule_confirmationMessageFinalType = 'text';

        if (confirmationMessage.startsWith('<speak>') && confirmationMessage.endsWith('</speak>'))
        {
          customerState.CurrentRule_confirmationMessageFinalType = 'ssml';
        }

        stateToSave.add('CurrentRule_confirmationMessageFinal');
        stateToSave.add('CurrentRule_confirmationMessageFinalType');
      }

      customerState.CurrentRule_validInput = 'true';
      stateToSave.add('CurrentRule_validInput');

      customerState.CurrentRule_slotValue = slotValue;
      stateToSave.add('CurrentRule_slotValue');

      customerState.CurrentRule_done = 'true';
      stateToSave.add('CurrentRule_done');

      customerState.CurrentRule_terminate = 'false';
      stateToSave.add('CurrentRule_terminate');

      customerState.System.LastNLUInput = slotValue;
      stateToSave.add('System');

      // Log a payload to advise the status of this menu
      var logPayload = {
        EventType: 'ANALYTICS',
        EventCode: 'NLU_INPUT',
        ContactId: contactId,
        RuleSet: customerState.CurrentRuleSet,
        Rule: customerState.CurrentRule,
        When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ValidSelection: 'true',
        SlotValue: slotValue,
        Confidence: intentConfidence,
        DataType: dataType
      };

      console.log(JSON.stringify(logPayload, null, 2));
    }
    else
    {
      console.error(`[ERROR] ${contactId} did not receive a slot value for data type: ${dataType}`);

      customerState.System.LastNLUInput = undefined;
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
        console.info(`Input attempt: ${errorCount} is less than maximum attempts: ${inputCount} playing error message and re-prompting`);

        customerState.CurrentRule_terminate = 'false';
        stateToSave.add('CurrentRule_terminate');
        customerState.CurrentRule_done = 'false';
        stateToSave.add('CurrentRule_done');

      }
      // If we have reached the maximum input attempts work out what the next step is
      else
      {
        console.info(`[INFO] ${contactId} Reached maximum user input attempts: ${inputCount} computing next action`);

        // Check to see if we have a error rule set name
        if (isEmptyString(errorRuleSetName))
        {
          console.info(`[INFO] ${contactId} Found invalid input with terminate behaviour`);
          customerState.CurrentRule_terminate = 'true';
          stateToSave.add('CurrentRule_terminate');
          customerState.CurrentRule_done = 'true';
          stateToSave.add('CurrentRule_done');
        }
        else
        {
          console.info(`[INFO] ${contactId} Found invalid input with error ruleset: ${errorRuleSetName}`);
          customerState.NextRuleSet = errorRuleSetName;
          stateToSave.add('NextRuleSet');
          customerState.CurrentRule_terminate = 'false';
          stateToSave.add('CurrentRule_terminate');
          customerState.CurrentRule_done = 'true';
          stateToSave.add('CurrentRule_done');
        }
      }

      // Log a payload to advise the status of this menu
      var logPayload = {
        EventType: 'ANALYTICS',
        EventCode: 'NLU_INPUT',
        ContactId: contactId,
        RuleSet: customerState.CurrentRuleSet,
        Rule: customerState.CurrentRule,
        When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ValidSelection: 'false',
        SlotValue: slotValue,
        DataType: dataType,
        FailureReason: 'INVALID'
      };

      console.log(JSON.stringify(logPayload, null, 2));
    }

    // Save the state and return it
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.error(`[ERROR] ${contactId} Failed to process NLUInput`, error);
    throw error;
  }
};

/**
 * Checks to see if value is a number
 */
function isNumber(value)
{
  if (value === undefined ||
      value === null ||
      value === '' ||
      value === true ||
      value === false ||
      isNaN(value))
  {
    return false;
  }
  else
  {
    return true;
  }
}

/**
 * Check for an empty or undefined string
 */
function isEmptyString(value)
{
  if (value === undefined ||
      value === null ||
      value === '')
  {
    return true;
  }
  else
  {
    return false;
  }
}

