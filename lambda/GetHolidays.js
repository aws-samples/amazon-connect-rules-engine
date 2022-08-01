
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Fetches the holidays in the system
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    await configUtils.checkLastChange(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      holidays: await configUtils.getHolidays(process.env.CONFIG_TABLE)
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to load holidays', error);
    return requestUtils.buildErrorResponse(error);
  }
};

