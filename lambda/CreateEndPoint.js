
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Creates a new end point in DynamoDB
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
    var name = body.name;
    var inboundNumbers = body.inboundNumbers;
    var description = body.description;
    var enabled = body.enabled;

    var endPoints = await dynamoUtils.getEndPoints(process.env.END_POINTS_TABLE);

    // Check for an existing end point with this name
    var existingEndPoint = endPoints.find(endPoint => endPoint.name.toLowerCase() === name.toLowerCase());

    if (existingEndPoint !== undefined)
    {
      console.log('[ERROR] end point already exists with this name: ' + name);

      return requestUtils.buildFailureResponse(409, {
        message: 'End point already exists for name'
      });
    }

    // This is a novel end point so create it
    var endPointId = await dynamoUtils.insertEndPoint(process.env.END_POINTS_TABLE,
      name, description, inboundNumbers, enabled);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      endPointId: endPointId
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to create end point', error);
    return requestUtils.buildErrorResponse(error);
  }
};

