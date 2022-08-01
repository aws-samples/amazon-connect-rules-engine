// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var rulesEngine = require('./utils/RulesEngine.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Deletes a rule set and the rules it manages
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var ruleSetId = event.queryStringParameters.ruleSetId;

    // Load all rule sets and rules
    var ruleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    // Find this rule set
    var ruleSet = ruleSets.find(rs => rs.ruleSetId === ruleSetId);

    if (ruleSet === undefined)
    {
      throw new Error('Failed to locate rule set for id: ' + ruleSetId);
    }

    // Check to see if any rules point to this rule set
    var referencingRuleSets = rulesEngine.getReferringRuleSets(ruleSet, ruleSets);

    var referencingRuleSetNames = Object.keys(referencingRuleSets);

    if (referencingRuleSetNames.length > 0)
    {
      var names = [];
      referencingRuleSetNames.forEach(name => {
        names.push(`${name} (Count: ${referencingRuleSets[name].length})`);
      });

      return requestUtils.buildFailureResponse(409, {
        message: 'Rule set cannot be deleted, in use from: ' + names.join(', ')
      });
    }

    await dynamoUtils.deleteRuleSetAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE, ruleSet);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'Rule set deleted successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete rule set', error);
    return requestUtils.buildErrorResponse(error);
  }
};

