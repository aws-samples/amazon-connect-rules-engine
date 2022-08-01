// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

const { v4: uuidv4 } = require('uuid');

/**
 * update a weight for a rule in DynamoDB
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var body = JSON.parse(event.body);

    var {ruleSetId, ruleId, field,weightId,operation,value,weight} = body;

    await dynamoUtils.updateWeight(process.env.RULES_TABLE, ruleSetId, ruleId,weightId, field,operation,value,weight);


    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'Weight updated successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to update weight', error);
    return requestUtils.buildErrorResponse(error);
  }
};
