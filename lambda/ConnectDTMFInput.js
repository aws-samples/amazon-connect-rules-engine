// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

var moment = require('moment');

/**
 * Handles processing the DTMF input
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

    // Fetch all config items and load them into the top level of the customer state
    await configUtils.checkLastChange(process.env.CONFIG_TABLE);
    var configItems = await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    var configKeys = Object.keys(configItems);

    configKeys.forEach(key => {
      customerState[key] = configItems[key];
    });

    var outputStateKey = customerState.CurrentRule_outputStateKey;
    var minLength = +customerState.CurrentRule_minLength;
    var maxLength = +customerState.CurrentRule_maxLength;
    var dataType = customerState.CurrentRule_dataType;

    // Fetches the customer input
    var input = event.Details.Parameters.input;

    console.log('[INFO] found raw user input: ' + input);

    var validInput = true;

    if (input === undefined || input === null || input === 'Timeout')
    {
      console.log('[ERROR] missing input');
      validInput = false;
    }
    else if (input.length < minLength || input.length > maxLength)
    {
      console.log(`[ERROR] input: ${input} length: ${input.length} is not within min: ${minLength} and max: ${maxLength} lengths`);
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
            console.log(`[ERROR] input: ${input} length: ${input.length} not 4`);
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
              console.log(`[ERROR] input: ${input} invalid month`);
              validInput = false;
            }

            if (year < yearNow)
            {
              console.log(`[ERROR] input: ${input} less than now (year)`);
              validInput = false;
            }

            if (year === yearNow && month < monthNow)
            {
              console.log(`[ERROR] input: ${input} less than now (month)`);
              validInput = false;
            }
          }
          break;
        }
        case 'Number':
        {
          if (!input.match(/^[0-9]*$/))
          {
            console.log(`[ERROR] input: ${input} is not a valid number`);
            validInput = false;
          }
          break;
        }
        case 'Phone':
        {
          if (!input.match(/^0[0-9]{9}$/))
          {
            console.log(`[ERROR] input: ${input} is not a valid number`);
            validInput = false;
          }
          break;
        }
        case 'Date':
        {
          if (!input.match(/^[0-3]{1}[0-9]{1}[0-1]{1}[0-9]{1}[1-2]{1}[0-9]{3}$/))
          {
            console.log(`[ERROR] input: ${input} is not a valid date by regex`);
            validInput = false;
          }
          else
          {
            if (!moment(input, 'DDMMYYYY', true).isValid())
            {
              console.log(`[ERROR] input: ${input} is not a valid date by parse`);
              validInput = false;
            }
          }
          break;
        }
      }
    }

    // Advise success
    if (validInput)
    {
      console.log(`[INFO] user entered valid input: ${input} storing in state key: ${outputStateKey}`);
      customerState.CurrentRule_validInput = 'true';
      customerState[outputStateKey] = input;
    }
    // Advise failure
    else
    {
      console.log(`[ERROR] user entered invalid input: ${input}`);
      customerState.CurrentRule_validInput = 'false';
    }

    var response = requestUtils.buildCustomerStateResponse(customerState);

    handlebarsUtils.templateMapObject(response, customerState);

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to process DTMFInput rule', error);
    throw error;
  }
};

