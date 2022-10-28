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

    var stateToSave = new Set();

    if (commonUtils.isEmptyString(phoneNumber))
    {
      console.error(`${contactId} no phone number provided, cannot send SMS`);
      inferenceUtils.updateState(customerState, stateToSave, 'System.LastSMSStatus', 'ERROR');
    }
    else
    {
      console.info(`${contactId} sending SMS to: ${phoneNumber}`);

      try
      {
        await snsUtils.sendSMS(phoneNumber, message);
        inferenceUtils.updateState(customerState, stateToSave, 'System.LastSMSStatus', 'SENT');
        console.info(`${contactId} SMS queued successfully`);
      }
      catch (snsError)
      {
        console.error(`${contactId} failed to send SMS to: ${phoneNumber}`, snsError);
        inferenceUtils.updateState(customerState, stateToSave, 'System.LastSMSStatus', 'ERROR');
      }
    }

    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));

    return {
      Success: 'true'
    };
  }
  catch (error)
  {
    console.error('Failed to send SMS', error);
    throw error;
  }
};

