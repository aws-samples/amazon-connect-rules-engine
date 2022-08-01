
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Creates a new rule set in DynamoDB
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
    var ruleSetName = body.ruleSetName;
    var ruleSetEnabled = body.ruleSetEnabled;
    var ruleSetDescription = body.ruleSetDescription;
    var endPoints = body.endPoints;
    var folder = body.folder;

    // Check for an existing rule set with this name and fail if it exists
    if (await dynamoUtils.checkRuleSetExistsByName(process.env.RULE_SETS_TABLE, ruleSetName))
    {
      console.log('[ERROR] rule set already exists with this name: ' + ruleSetName);

      return requestUtils.buildFailureResponse(409, {
        message: 'Rule set already exists'
      });
    }
    // This is a novel rule set so create it
    else
    {
      var ruleSetId = await dynamoUtils.insertRuleSet(process.env.RULE_SETS_TABLE,
        ruleSetName, ruleSetEnabled, ruleSetDescription, endPoints, folder);

      // Mark the last change to now
      await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

      return requestUtils.buildSuccessfulResponse({
        ruleSetId: ruleSetId
      });
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to create rule set', error);
    return requestUtils.buildErrorResponse(error);
  }
};

