// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Handles processing the DTMF selector, updating state on success
 * or setting an error flag if an invalid input is selected.
 * If the user select '0' go the next rule set pointed to by param.ruleSet
 * otherwise set the resolved value for the parameter.
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);

    // Grab the contact id from the event
    var contactId = event.Details.ContactData.InitialContactId;

    // Load the current customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Fetches the selected option
    var selectedOption = event.Details.Parameters.selectedOption;

    console.log('[INFO] found raw user input: ' + selectedOption);

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

    if (!isNumber(selectedOption))
    {
      console.log(`[ERROR] Non numeric input option: ${selectedOption}`);

      // Advise of the invalid selection and echo back the offer message
      return {
        validSelection: 'false',
        CurrentRule_offerMessage: customerState.CurrentRule_offerMessage
      };
    }

    console.log('[INFO] found processed numeric user input: ' + selectedOption);

    if (selectedOption === '0')
    {
      console.log(`[INFO] user pressed 0 going to next rule set: ${customerState.CurrentRule_ruleSetName}`);

      customerState.NextRuleSet = customerState.CurrentRule_ruleSetName;
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, [ 'NextRuleSet' ]);

      return {
        validSelection: 'true',
        CurrentRule_offerMessage: customerState.CurrentRule_offerMessage
      };
    }

    var numericalOption = +selectedOption;

    if (numericalOption > customerState.CurrentRule_optionCount)
    {
      console.log(`[ERROR] user selected an invalid option outside range: ${selectedOption}`);

      // Advise of the invalid selection and echo back the offer message
      return {
        validSelection: 'false',
        CurrentRule_offerMessage: customerState.CurrentRule_offerMessage
      };
    }

    // Looks good save the state value
    var value = customerState['CurrentRule_dtmf' + numericalOption];

    console.log(`[INFO] user selected a valid option: ${selectedOption} with output key: ${customerState.CurrentRule_outputKey} mapped to value: ${JSON.stringify(value, null, 2)}`);

    customerState[customerState.CurrentRule_outputKey] = value;
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, [ customerState.CurrentRule_outputKey ]);

    return {
      validSelection: 'true',
      CurrentRule_offerMessage: customerState.CurrentRule_offerMessage
    };
  }
  catch (error)
  {
    console.log('[ERROR] failed to process DTMF selector', error);
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
      value === 'true' ||
      value === 'false' ||
      isNaN(value))
  {
    return false;
  }
  else
  {
    return true;
  }
}

