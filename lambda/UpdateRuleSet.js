// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Updates an existing rule set in DynamoDB
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
    var ruleSetId = body.ruleSetId;
    var ruleSetEnabled = body.ruleSetEnabled;
    var ruleSetDescription = body.ruleSetDescription;
    var endPoints = body.endPoints;
    var folder = body.folder;

    await dynamoUtils.updateRuleSet(process.env.RULE_SETS_TABLE,
      ruleSetId, ruleSetEnabled, ruleSetDescription, endPoints, folder);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'Rule set updated successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to update rule set', error);
    return requestUtils.buildErrorResponse(error);
  }
};
