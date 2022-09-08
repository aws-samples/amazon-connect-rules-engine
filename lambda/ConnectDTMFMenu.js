// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const inferenceUtils = require('./utils/InferenceUtils');
const commonUtils = require('./utils/CommonUtils');
const keepWarmUtils = require('./utils/KeepWarmUtils');
const moment = require('moment');

/**
 * Handles processing the DTMF menu selection, now handles
 * more logic to simplify the contact flow
 */
exports.handler = async(event, context) =>
{
  var contactId = undefined;

  try
  {
    requestUtils.logRequest(event);

    // Check for warm up message and bail out after cache loads
    if (keepWarmUtils.isKeepWarmRequest(event))
    {
      return await keepWarmUtils.makeKeepWarmResponse(event, 0);
    }

    // Grab the contact id from the event
    contactId = event.Details.ContactData.InitialContactId;

    // Load the current customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

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

    // Fetches the selected option
    var selectedOption = event.Details.Parameters.selectedOption;

    console.info(`[INFO] ${contactId} found raw user input: ${selectedOption}`);

    if (selectedOption === '*')
    {
      selectedOption = 'Star';
    }

    if (selectedOption === '#')
    {
      selectedOption = 'Pound';
    }

    if (selectedOption === '+')
    {
      selectedOption = 'Plus';
    }

    console.info(`[INFO] ${contactId} found processed user input: ${selectedOption}`);

    var configuredOption = customerState['CurrentRule_dtmf' + selectedOption];

    // We found a valid selection!
    if (configuredOption !== undefined)
    {
      console.log(`[INFO] ${contactId} user selected a valid option: ${selectedOption} mapped to rule set: ${configuredOption}`);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validSelection', 'true');
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_failureReason', undefined);
      inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', configuredOption);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
      inferenceUtils.updateState(customerState, stateToSave, 'System.LastSelectedDTMF', selectedOption);

      // Log a payload to advise the status of this menu
      var logPayload = {
        EventType: 'ANALYTICS',
        EventCode: 'DTMF_MENU_SELECTION',
        ContactId: contactId,
        RuleSet: customerState.CurrentRuleSet,
        Rule: customerState.CurrentRule,
        NextRuleSet: configuredOption,
        When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ValidSelection: 'true',
        Selection: selectedOption
      };

      console.log(JSON.stringify(logPayload, null, 2));
    }
    else
    {
      console.error(`[ERROR] ${contactId} User selected an invalid option: ${selectedOption}`);
      inferenceUtils.updateState(customerState, stateToSave, 'System.LastSelectedDTMF', undefined);

      var errorRuleSetName = customerState.CurrentRule_errorRuleSetName;
      var noInputRuleSetName = customerState.CurrentRule_noInputRuleSetName;

      // Increment the error count
      errorCount++;

      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorCount', '' + errorCount);

      // Compute the failure reason
      if (selectedOption === 'Timeout')
      {
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_failureReason', 'NOINPUT');
      }
      else
      {
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_failureReason', 'NOMATCH');
      }

      // Record that we got an invalid selection so we can play the error message
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validSelection', 'false');

      // Compute the next error message and type
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessage', customerState['CurrentRule_errorMessage' + errorCount]);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessageType', customerState['CurrentRule_errorMessage' + errorCount + 'Type']);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_errorMessagePromptArn', customerState['CurrentRule_errorMessage' + errorCount + 'PromptArn']);

      // If we haven't reached max attempts loop around so play the error and re-prompt
      if (errorCount < inputCount)
      {
        console.info(`Input attempt: ${errorCount} is less than maximum attempts: ${inputCount} playing error message and re-prompting`);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'false');
      }
      // If we have reached the maximum input attempts work out what the next step is
      else
      {
        console.info(`[INFO] ${contactId} Reached maximum user input attempts: ${inputCount} computing next action`);

        // Found no input
        if (selectedOption === 'Timeout')
        {
          // Check to see if we have a no input error rule set name
          if (commonUtils.isEmptyString(noInputRuleSetName))
          {
            console.info(`[INFO] ${contactId} Found no input with terminate behaviour`);
            inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'true');
            inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
          }
          else
          {
            console.info(`[INFO] ${contactId} Found no input with error ruleset: ${noInputRuleSetName}`);

            inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', noInputRuleSetName);
            inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
            inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
          }
        }
        // Found no match error cause
        else
        {
          // Check to see if we have a no match error rule set name
          if (commonUtils.isEmptyString(errorRuleSetName))
          {
            console.info(`[INFO] ${contactId} Found no match with terminate behaviour`);
            inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'true');
            inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
          }
          else
          {
            console.info(`[INFO] ${contactId} Found no match with error ruleset: ${errorRuleSetName}`);
            inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', errorRuleSetName);
            inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_terminate', 'false');
            inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_done', 'true');
          }
        }
      }

      // Log a payload to advise the status of this menu
      var logPayload = {
        EventType: 'ANALYTICS',
        EventCode: 'DTMF_MENU_SELECTION',
        ContactId: contactId,
        RuleSet: customerState.CurrentRuleSet,
        Rule: customerState.CurrentRule,
        When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ValidSelection: 'false',
        Selection: selectedOption,
        FailureReason: customerState.CurrentRule_failureReason
      };

      console.log(JSON.stringify(logPayload, null, 2));
    }

    // Save the state and return it
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.error(`[ERROR] ${contactId} Failed to process DTMFMenu`, error);
    throw error;
  }
};

