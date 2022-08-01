
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches a single rule set by id or all rule sets
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var ruleSets = [];
    var ruleSetId = undefined;

    if (event.queryStringParameters !== null)
    {
      ruleSetId = event.queryStringParameters.ruleSetId;
    }

    if (ruleSetId !== undefined)
    {
      var ruleSet = await dynamoUtils.getRuleSet(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE, ruleSetId);
      ruleSets = [ ruleSet ];
    }
    else
    {
      ruleSets = await dynamoUtils.getAllRuleSets(process.env.RULE_SETS_TABLE);
    }

    return requestUtils.buildSuccessfulResponse({
      ruleSets: ruleSets
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule sets', error);
    return requestUtils.buildErrorResponse(error);
  }
};
