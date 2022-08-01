// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Clone rule from existing and Creates a new rule in DynamoDB
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    const CONFLICT_HTTP_ERROR_CODE = 409;
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var body = JSON.parse(event.body);
    var {ruleSetId, ruleId, ruleName} = body;

    // Check for an existing rule with this name in this rule set and fail if it exists
    if (await dynamoUtils.checkRuleExistsByName(process.env.RULES_TABLE, ruleSetId, ruleName))
    {
      console.log('[ERROR] rule already exists with this name: ' + ruleName);

      return requestUtils.buildFailureResponse(CONFLICT_HTTP_ERROR_CODE, {
        message: 'Rule already exists'
      });
    }
    // This is a novel rule so create it
    else
    {
      var ruleData = await dynamoUtils.getRule(process.env.RULES_TABLE,ruleSetId,ruleId)

      var ruleIdNew = await dynamoUtils.insertRule(process.env.RULES_TABLE,
        ruleSetId, ruleName, ruleData.enabled, ruleData.description, ruleData.priority, ruleData.activation,
        ruleData.type, ruleData.params, ruleData.weights);

      // Mark the last change to now
      await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

      return requestUtils.buildSuccessfulResponse({
        ruleId: ruleIdNew
      });
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to create rule', error);
    return requestUtils.buildErrorResponse(error);
  }
};
