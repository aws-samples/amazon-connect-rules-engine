// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var rulesEngine = require('./utils/RulesEngine.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Renames a rule
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
    var ruleId = body.ruleId;
    var ruleName = body.ruleName;

    // Load the rule set and it's rules
    var ruleSet = await dynamoUtils.getRuleSet(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE, ruleSetId);

    if (ruleSet === undefined)
    {
      throw new Error('Failed to locate rule set for id: ' + ruleSetId);
    }

    var rule = ruleSet.rules.find(r => r.ruleId === ruleId);

    if (rule === undefined)
    {
      throw new Error('Failed to locate rule for id: ' + ruleId);
    }

    // Make sure there are no other rules in this ruleset with the new name
    var existingRule = ruleSet.rules.find(r => r.name === ruleName);

    if (existingRule !== undefined)
    {
      return requestUtils.buildFailureResponse(409, {
        message: 'A rule already exists with name: ' + ruleName
      });
    }

    // Rename the rule
    await dynamoUtils.updateRuleName(process.env.RULES_TABLE, ruleSetId, ruleId, ruleName);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    // Success!
    return requestUtils.buildSuccessfulResponse({
      message: 'Rule renamed successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to rename rule', error);
    return requestUtils.buildErrorResponse(error);
  }
};

