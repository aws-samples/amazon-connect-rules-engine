
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Imports rule sets and rules, clearing all existing rule sets and rules
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var body = JSON.parse(event.body);

    var ruleSetsToImport = body.ruleSets;

    console.log('[INFO] about to import rule sets');

    await dynamoUtils.importRuleSets(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE,
      process.env.END_POINTS_TABLE, ruleSetsToImport);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      importCount: ruleSetsToImport.length
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to import rule sets', error);
    return requestUtils.buildErrorResponse(error);
  }
};
