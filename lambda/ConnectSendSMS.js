// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var snsUtils = require('./utils/SNSUtils.js');

/**
 * Handles sending an SMS via SNS
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);

    // Load customer state
    var contactId = event.Details.ContactData.InitialContactId;
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    requestUtils.requireParameter('CurrentRule_phoneNumberKey', customerState.CurrentRule_phoneNumberKey);
    requestUtils.requireParameter('CurrentRule_message', customerState.CurrentRule_message);
    requestUtils.requireParameter(customerState.CurrentRule_phoneNumberKey, customerState[customerState.CurrentRule_phoneNumberKey]);

    var phoneNumber = customerState[customerState.CurrentRule_phoneNumberKey];
    var message = customerState.CurrentRule_message;

    await snsUtils.sendSMS(phoneNumber, message);

    console.log('[INFO] successfully sent SMS');

    return {
      Success: 'true'
    };

  }
  catch (error)
  {
    console.log('[ERROR] failed to process DTMF input', error);
    throw error;
  }
};

