
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');
var inferenceUtils = require('./utils/InferenceUtils.js');

/**
 * Deletes an end point
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var endPointId = event.queryStringParameters.endPointId;

    var endPoints = await dynamoUtils.getEndPoints(process.env.END_POINTS_TABLE);

    var endPoint = endPoints.find(endPoint => endPoint.endPointId === endPointId);

    if (endPoint === undefined)
    {
      return requestUtils.buildFailureResponse(404, {
        message: 'End point not found'
      });
    }

    var endPointName = endPoint.name;

    // Check and clear the ruleset cache
    if (!await configUtils.checkLastChange(process.env.CONFIG_TABLE))
    {
      inferenceUtils.clearCache();
    }

    // Check for rule sets bound to this end point
    await inferenceUtils.cacheRuleSets(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    var ruleSet = inferenceUtils.getRuleSetByEndPoint(endPointName);

    if (ruleSet !== undefined)
    {
      return requestUtils.buildFailureResponse(409, {
        message: 'End point cannot be deleted, in use from: ' + ruleSet.name
      });
    }

    // Delete the dangling rule set
    await dynamoUtils.deleteEndPoint(process.env.END_POINTS_TABLE, endPointId);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'End point deleted successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to delete end point', error);
    return requestUtils.buildErrorResponse(error);
  }
};
