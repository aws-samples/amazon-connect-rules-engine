
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var rulesEngine = require('./utils/RulesEngine.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Renames a rule set and it's dependencies
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
    var ruleSetName = body.ruleSetName;

    // Load all rule sets and rules
    var ruleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    // Find this rule set and fail if not found
    var ruleSet = ruleSets.find(rs => rs.ruleSetId === ruleSetId);

    if (ruleSet === undefined)
    {
      throw new Error('Failed to locate rule set for id: ' + ruleSetId);
    }

    // If a ruleset exists with this name, error with a nice message
    var ruleSetSharedName = ruleSets.find(rs => rs.name === ruleSetName);

    if (ruleSetSharedName !== undefined)
    {
      return requestUtils.buildFailureResponse(409, {
        message: 'A rule set already exists with name: ' + ruleSetName
      });
    }

    // Check to see if any rules point to this rule set
    var referencingRules = rulesEngine.getReferringRules(ruleSet, ruleSets);

    // Update the rules that point to this and the rule set itself
    await dynamoUtils.renameRuleSet(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE, ruleSetName, ruleSet, referencingRules);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    // Success!
    return requestUtils.buildSuccessfulResponse({
      message: 'Rule set renamed successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to rename rule set', error);
    return requestUtils.buildErrorResponse(error);
  }
};

