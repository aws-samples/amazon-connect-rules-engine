// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

var moment = require('moment');

/**
 * Caches all Amazon Connect data in DynamoDB, triggered via CloudWatch CRON
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);

    await connectUtils.cacheConnectData(process.env.STAGE, process.env.SERVICE,
      process.env.REGION, process.env.ACCOUNT_NUMBER, process.env.INSTANCE_ID,
      process.env.BOT_ALIAS, process.env.BOT_LOCALE_ID,
      process.env.CONFIG_TABLE);

    console.log('[INFO] fetched and cached all Connect data into DynamoDB');

    return {
      success: true
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to fetch and cache Connect config data into DynamoDB', error);
    throw error;
  }
};
