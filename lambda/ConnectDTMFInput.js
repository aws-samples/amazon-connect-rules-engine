// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const handlebarsUtils = require('./utils/HandlebarsUtils');
const keepWarmUtils = require('./utils/KeepWarmUtils');
const inferenceUtils = require('./utils/InferenceUtils');
const commonUtils = require('./utils/CommonUtils');
const moment = require('moment');

/**
 * Handles processing the DTMF input
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

    var outputStateKey = customerState.CurrentRule_outputStateKey;
    var minLength = +customerState.CurrentRule_minLength;
    var maxLength = +customerState.CurrentRule_maxLength;
    var dataType = customerState.CurrentRule_dataType;

    // Fetches the customer input
    var input = event.Details.Parameters.input;

    console.info(`${contactId} found raw user input: ${input}`);

    var validInput = true;

    if (input === undefined || input === null || input === 'Timeout')
    {
      console.error(`${contactId} missing input`);
      validInput = false;
    }
    else if (input.length < minLength || input.length > maxLength)
    {
      console.info(`${contactId} input: ${input} length: ${input.length} is not within min: ${minLength} and max: ${maxLength} lengths`);
      validInput = false;
    }
    else
    {
      switch (dataType)
      {
        case 'CreditCardExpiry':
        {
          if (input.length !== 4)
          {
            console.error(`${contactId} input: ${input} length: ${input.length} not 4`);
            validInput = false;
          }
          else
          {
            var month = +input.substring(0, 2);
            var year = '' + input.substring(2, 4);

            var fullYearNow = '' + new Date().getFullYear();
            var yearNow = fullYearNow.substring(2, 4);

            var monthNow = new Date().getMonth() + 1;

            if (month < 1 || month > 12)
            {
              console.error(`${contactId} input: ${input} invalid month`);
              validInput = false;
            }

            if (year < yearNow)
            {
              console.error(`${contactId} input: ${input} less than now (year)`);
              validInput = false;
            }

            if (year === yearNow && month < monthNow)
            {
              console.error(`${contactId} input: ${input} less than now (month)`);
              validInput = false;
            }
          }
          break;
        }
        case 'Number':
        {
          if (!input.match(/^[0-9]*$/))
          {
            console.error(`${contactId} input: ${input} is not a valid number`);
            validInput = false;
          }
          break;
        }
        case 'Phone':
        {
          if (!input.match(/^0[0-9]{9}$/))
          {
            console.error(`${contactId} input: ${input} is not a valid number`);
            validInput = false;
          }
          break;
        }
        case 'Date':
        {
          if (!input.match(/^[0-3]{1}[0-9]{1}[0-1]{1}[0-9]{1}[1-2]{1}[0-9]{3}$/))
          {
            console.error(`${contactId} input: ${input} is not a valid date by regex`);
            validInput = false;
          }
          else
          {
            if (!moment(input, 'DDMMYYYY', true).isValid())
            {
              console.error(`${contactId} input: ${input} is not a valid date by parse`);
              validInput = false;
            }
          }
          break;
        }
      }
    }

    // We won't actually save state here as this is done after confirmation
    // We just need the output key set for templating
    // Use inference utils to write to state to ensure nested output
    // state keys are supported
    var stateToSave = new Set();

    // Advise success
    if (validInput)
    {
      console.info(`${contactId} user entered valid input: ${input} storing in state key for templating: ${outputStateKey}`);
      inferenceUtils.updateState(customerState, stateToSave, outputStateKey, input);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validInput', 'true');

      if (commonUtils.isEmptyString(customerState.CurrentRule_confirmationMessage))
      {
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageType', 'none');
      }
      else if (customerState.CurrentRule_confirmationMessage.startsWith('<speak>') &&
        customerState.CurrentRule_confirmationMessage.endsWith('</speak>'))
      {
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageType', 'ssml');
      }
      else
      {
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_confirmationMessageType', 'text');
      }
    }
    // Advise failure
    else
    {
      console.error(`${contactId} user entered invalid input: ${input}`);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_validInput', 'false');
    }

    var response = requestUtils.buildCustomerStateResponse(customerState);
    handlebarsUtils.templateMapObject(response, customerState);
    return response;
  }
  catch (error)
  {
    console.error(`${contactId} failed to process DTMFInput rule`, error);
    throw error;
  }
};

