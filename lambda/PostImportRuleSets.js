
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Handles post import rule sets including deleting dangling rule sets
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var body = JSON.parse(event.body);

    var importedRuleSets = body.importedRuleSets;

    console.log('[INFO] about to perform post import actions');

    var existingRuleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    var deletedCount = 0;

    for (var i = 0; i < existingRuleSets.length; i++)
    {
      var existingRuleSet = existingRuleSets[i];
      var newRuleSet = importedRuleSets.find(ruleSetName => ruleSetName === existingRuleSet.name);

      if (newRuleSet === undefined)
      {
        await dynamoUtils.deleteRuleSetAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE, existingRuleSet);
        deletedCount++;
      }
    }

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    console.log(`[INFO] successfully deleted: ${deletedCount} dangling rule sets`);

    return requestUtils.buildSuccessfulResponse({
      deletedCount: deletedCount
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to perform post import actions', error);
    return requestUtils.buildErrorResponse(error);
  }
};
