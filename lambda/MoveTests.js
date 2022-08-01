
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Moves tests to a new folder
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var body = JSON.parse(event.body);
    var testIds = body.testIds;
    var newFolder = body.newFolder;

    await dynamoUtils.moveTests(process.env.TESTS_TABLE, testIds, newFolder);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'Tests moved successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to move tests', error);
    return requestUtils.buildErrorResponse(error);
  }
};
