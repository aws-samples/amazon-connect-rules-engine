// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const commonUtils = require('./utils/CommonUtils');
const moment = require('moment');

/**
 * Creates call history record in DynamoDB for the requested action
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);

    var phoneNumber = event.Details.Parameters.phoneNumber;
    var action = event.Details.Parameters.action;

    if (phoneNumber === undefined)
    {
      throw new Error('Missing required parameter: phoneNumber');
    }

    if (action === undefined)
    {
      throw new Error('Missing required parameter: action');
    }

    // Use Fractional seconds to ensure unique records
    // TODO perhaps requires a conditional insert here
    await dynamoUtils.insertCallHistory(process.env.CALL_HISTORY_TABLE,
      phoneNumber, commonUtils.nowUTCMillis(), action);

    return {
      result: 'Success'
    };
  }
  catch (error)
  {
    console.log('[ERROR] failed to insert call history', error);
    throw error;
  }
};

