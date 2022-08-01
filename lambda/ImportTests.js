
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Imports tests that are production ready, identifying existing tests based on name and folder
 * ignoring non-production ready tests
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

    var testsToImport = body.tests;

    console.info('About to import tests');

    var result = await dynamoUtils.importTests(process.env.TESTS_TABLE, testsToImport);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse(result);
  }
  catch (error)
  {
    console.error('Failed to import tests', error);
    return requestUtils.buildErrorResponse(error);
  }
};
