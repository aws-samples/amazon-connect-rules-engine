// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

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

    // We got a slot value
    if (slotValue !== undefined)
    {
      console.log(`[INFO] ${contactId} found slot type: ${slotType} and raw slot value: ${slotValue}`);

      customerState.CurrentRule_validSelection = 'true';
      stateToSave.add('CurrentRule_validSelection');

      customerState.CurrentRule_failureReason = undefined;
      stateToSave.add('CurrentRule_failureReason');

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
        NextRuleSet: configuredOption,
        When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ValidSelection: 'true',
        Input: slotValue,
        Type: slotType
      };

      console.log(JSON.stringify(logPayload, null, 2));
    }
    else
    {
      console.error(`[ERROR] ${contactId} User did not provide a slot value for slot type: ${slotType}`);

      customerState.System.LastNLUInput = undefined;
      stateToSave.add('System');

      var errorRuleSetName = customerState.CurrentRule_errorRuleSetName;

      // Increment the error count
      errorCount++;
      customerState.CurrentRule_errorCount = '' + errorCount;
      stateToSave.add('CurrentRule_errorCount');

      // Record that we got an invalid selection so we can play the error message
      customerState.CurrentRule_validSelection = 'false';
      stateToSave.add('CurrentRule_validSelection');

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
        Input: slotValue,
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

