
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Deletes a weight
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
    var ruleId = event.queryStringParameters.ruleId;
    var weightId = event.queryStringParameters.weightId;

    await dynamoUtils.deleteWeight(process.env.RULES_TABLE, ruleSetId, ruleId, weightId);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'Weight deleted successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete weight', error);
    return requestUtils.buildErrorResponse(error);
  }
};
