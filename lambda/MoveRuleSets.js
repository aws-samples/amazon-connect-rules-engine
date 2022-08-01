// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Moves rule sets to a new folder
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
    var ruleSetIds = body.ruleSetIds;
    var newFolder = body.newFolder;

    await dynamoUtils.moveRuleSets(process.env.RULE_SETS_TABLE, ruleSetIds, newFolder);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'Rule sets moved successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to move rule sets', error);
    return requestUtils.buildErrorResponse(error);
  }
};
