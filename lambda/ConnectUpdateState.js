// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const configUtils = require('./utils/ConfigUtils');
const inferenceUtils = require('./utils/InferenceUtils');
const commonUtils = require('./utils/CommonUtils');
const moment = require('moment');

/**
 * Sets a range of state flags for a customer expecting input parameters in the format:
 *  key1 = 'stateKey'
 *  value1 = 'stateValue'
 *
 * If the value is 'increment' this will add one to an existing value
 * and if the value is undefined will set it to 1
 *
 * Missing or empty values for keys will result in state deletions for that key.
 *
 * Gaps in key indices are not currently supported.
 *
 * Loads and returns all state values for this contact in the response in the format:
 *
 * {
 *    stateKey: stateValue,
 *    ...
 * }
 *
 */
exports.handler = async(event, context) =>
{
  try
  {
    var contactId = event.Details.ContactData.InitialContactId;

    var statesToAdd = [];
    var statesToRemove = [];

    var index = 1;

    // Load customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Fetch all config items and load them into the top level of the customer state
    await configUtils.checkLastChange(process.env.CONFIG_TABLE);
    var configItems = await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    var configKeys = Object.keys(configItems);

    configKeys.forEach(configKey => {
      customerState[configKey] = configItems[configKey];
    });

    var stateToSave = new Set();

    while (event.Details.Parameters['key' + index] !== undefined)
    {
      var key = event.Details.Parameters['key' + index];

      if (key === '')
      {
        continue;
      }

      var value = event.Details.Parameters['value' + index];

      if (value === 'increment')
      {
        // Look in the customer state and try and safely increment
        var existingValue = customerState[key];

        if (!commonUtils.isNumber(existingValue))
        {
          value = '1';
          console.log(`[INFO] incremented missing or invalid value for key: ${key} to 1`);
        }
        else
        {
          value = '' + (+existingValue + 1);
          console.log(`[INFO] incremented existing value for key: ${key} to ${value}`);
        }
      }

      inferenceUtils.updateState(customerState, stateToSave, key, value);

      index++;
    }

    console.log('[INFO] found states to update: ' + Array.from(stateToSave).join(', '));

    // Persist the changed state fields to DynamoDB
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));

    // Echo back the customer state
    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.log('[ERROR] failed to update customer state', error);
    throw error;
  }
};

