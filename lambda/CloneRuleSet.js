
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var rulesEngine = require('./utils/RulesEngine.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Clones a rule set with a new name, dependencies still point to the orginal ruleset
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
    var newRuleSetName = body.ruleSetName;

    // Load all rule sets and rules
    var ruleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    // Find this rule set and fail if not found
    var ruleSet = ruleSets.find(rs => rs.ruleSetId === ruleSetId);

    if (ruleSet === undefined)
    {
      throw new Error('Failed to locate rule set for id: ' + ruleSetId);
    }

    // If a ruleset exists with this name, error with a nice message
    var ruleSetSharedName = ruleSets.find(rs => rs.name === newRuleSetName);

    if (ruleSetSharedName !== undefined)
    {
      return requestUtils.buildFailureResponse(409, {
        message: 'A rule set already exists with name: ' + newRuleSetName
      });
    }

    // Clone the rule set with a new name
    var cloneRuleSetId = await dynamoUtils.cloneRuleSet(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE, newRuleSetName, ruleSet);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    // Success!
    return requestUtils.buildSuccessfulResponse({
      message: 'Rule set cloned successfully',
      ruleSetId: cloneRuleSetId
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to clone rule set', error);
    return requestUtils.buildErrorResponse(error);
  }
};

