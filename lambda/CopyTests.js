
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Copies tests to a new folder
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
    var copyFolder = body.copyFolder;

    await dynamoUtils.copyTests(process.env.TESTS_TABLE, testIds, copyFolder);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'Tests copied successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to copy tests', error);
    return requestUtils.buildErrorResponse(error);
  }
};
