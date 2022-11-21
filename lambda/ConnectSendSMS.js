// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const snsUtils = require('./utils/SNSUtils');
const pinpointUtils = require('./utils/PinpointUtils');
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

    var pinpointApplicationId = process.env.PINPOINT_APPLICATION_ID;
    var originationNumber = process.env.ORIGINATION_NUMBER;

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
        if (!commonUtils.isEmptyString(pinpointApplicationId) &&
            !commonUtils.isEmptyString(originationNumber))
        {
          console.info(`${contactId} sending SMS via Pinpoint`)
          await pinpointUtils.sendSMS(phoneNumber, message, originationNumber, pinpointApplicationId, 'TRANSACTIONAL');
          inferenceUtils.updateState(customerState, stateToSave, 'System.LastSMSStatus', 'SENT');
          console.info(`${contactId} SMS queued successfully via Pinpoint`);
        }
        else
        {
          console.info(`${contactId} sending SMS via SNS`);
          await snsUtils.sendSMS(phoneNumber, message);
          inferenceUtils.updateState(customerState, stateToSave, 'System.LastSMSStatus', 'SENT');
          console.info(`${contactId} SMS queued successfully via SNS`);
        }
      }
      catch (smsError)
      {
        console.error(`${contactId} failed to send SMS to: ${phoneNumber}`, smsError);
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

