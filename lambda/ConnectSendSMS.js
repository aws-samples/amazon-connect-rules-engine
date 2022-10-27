// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const snsUtils = require('./utils/SNSUtils');
const inferenceUtils = require('./utils/InferenceUtils');
const commonUtils = require('./utils/CommonUtils');

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

    var phoneNumber = inferenceUtils.getStateValue(customerState, customerState.CurrentRule_phoneNumberKey);
    var message = customerState.CurrentRule_message;

    if (commonUtils.isEmptyString(phoneNumber))
    {
      throw new Error(`${contactId} no phone number provided, cannot send SMS`);
    }

    console.info(`${contactId} sending SMS to: ${phoneNumber}`);

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

