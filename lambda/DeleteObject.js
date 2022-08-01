// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Generic domain object deletion Lambda function
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);

    var type = event.queryStringParameters.type;
    var id = event.queryStringParameters.id;

    if (type === undefined || id === undefined)
    {
      throw new Error('Missing required parameters, id and type');
    }

    switch (type)
    {
      case 'batch':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);
        logDelete(user, type, id);
        await dynamoUtils.deleteBatch(process.env.VERIFY_TABLE, id);
        break;
      }
      case 'test':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);
        logDelete(user, type, id);
        await dynamoUtils.deleteTest(process.env.TESTS_TABLE, id);
        break;
      }
      case 'user':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR']);
        logDelete(user, type, id);
        await dynamoUtils.deleteUser(process.env.USERS_TABLE, id);
        break;
      }
      case 'holiday':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);
        logDelete(user, type, id);
        await deleteHoliday(id);
        break;
      }

      // TODO add the remaining domain objects and handling
      default:
      {
        throw new Error('Unhandled object type: ' + type);
      }
    }

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'Object deleted successfully'
    });
  }
  catch (error)
  {
    console.error('Failed to delete object', error);
    return requestUtils.buildErrorResponse(error);
  }
};

/**
 * Logs the upcoming delete
 */
function logDelete(user, type, id)
{
  console.info(`User ${user.firstName} ${user.lastName} (${user.emailAddress}) is deleting: ${type} with id: ${id}`);
}

/**
 * Deletes a holiday from the config table
 */
async function deleteHoliday(holidayId)
{
  await configUtils.checkLastChange(process.env.CONFIG_TABLE);

  var holidays = await configUtils.getHolidays(process.env.CONFIG_TABLE);

  // Find the editing holiday
  var existing = holidays.find(holiday => holiday.holidayId === holidayId);

  if (existing === undefined)
  {
    throw new Error('Failed to find existing holiday to delete');
  }

  var holidaysToKeep = [];

  holidays.forEach(holiday =>
  {
    if (holiday.holidayId !== holidayId)
    {
      holidaysToKeep.push(holiday);
    }
  });

  var holidaysToSave = JSON.stringify(holidaysToKeep);

  await configUtils.updateConfigItem(process.env.CONFIG_TABLE, 'Holidays', holidaysToSave);
}
