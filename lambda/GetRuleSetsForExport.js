// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches all rule sets and rules for export
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var ruleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    // Remove the rule set ids, rule ids and weight ids from the response
    ruleSets.forEach(ruleSet => {

      ruleSet.ruleSetId = undefined;

      ruleSet.rules.forEach(rule => {
        rule.ruleId = undefined;
        rule.ruleSetId = undefined;

        rule.weights.forEach(weight => {
          weight.weightId = undefined;
        });
      });
    });


    return requestUtils.buildSuccessfulResponse({
      ruleSets: ruleSets
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule sets for export', error);
    return requestUtils.buildErrorResponse(error);
  }
};
