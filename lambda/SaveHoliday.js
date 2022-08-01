
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

const { v4: uuidv4 } = require('uuid');

/**
 * Saves a holiday in DynamoDB
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
    var holidayId = body.holidayId;
    var when = body.when;
    var name = body.name;
    var description = body.description;
    var closed = body.closed;

    await configUtils.checkLastChange(process.env.CONFIG_TABLE);

    var holidays = await configUtils.getHolidays(process.env.CONFIG_TABLE);

    // Find the editing holiday
    var existing = holidays.find(holiday => holiday.holidayId === holidayId);

    if (existing === undefined)
    {
      throw new Error('Failed to find existing holiday to update');
    }

    existing.name = name;
    existing.description = description;
    existing.closed = closed;
    existing.when = when;

    var holidaysToSave = JSON.stringify(holidays);

    await configUtils.updateConfigItem(process.env.CONFIG_TABLE, 'Holidays', holidaysToSave);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      holidayId: holidayId
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to create holiday', error);
    return requestUtils.buildErrorResponse(error);
  }
};

