// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Loads state for this contact
 */
exports.handler = async(event, context) =>
{
  try
  {
    var contactId = event.Details.ContactData.InitialContactId;

    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Fetch all config items and load them into the top level of the customer state
    await configUtils.checkLastChange(process.env.CONFIG_TABLE);
    var configItems = await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    var configKeys = Object.keys(configItems);

    configKeys.forEach(key => {
      customerState[key] = configItems[key];
    });

    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.log('[ERROR] failed to load state', error);
    throw error;
  }
};

