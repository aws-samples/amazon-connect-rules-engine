// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var configUtils = require('./ConfigUtils.js');
var moment = require('moment-timezone');

/**
 * Check to see if today local time is a holiday
 */
module.exports.isHoliday = async function (configTable, whenUTC)
{
  try {
    var allHolidays = await configUtils.getHolidays(configTable);
    var timeZone = await configUtils.getCallCentreTimeZone(configTable);
    var now = moment(whenUTC).tz(timeZone);

    var nowStr = now.format('YYYYMMDD');

    var existingHoliday = allHolidays.find(holiday => holiday.when === nowStr);

    return existingHoliday !== undefined;
  }
  catch (error) {
    console.log('[ERROR] failed to determine holiday status', error);
    throw error;
  }
}

/**
 * Evaluates a single hours of operation given an hours and a point in time
 */
module.exports.evaluateSingleOperatingHours = function (operatingHours, when)
{
  var localTime = moment().tz(operatingHours.Timezone);
  var localDayName = localTime.format('dddd').toUpperCase();
  var localHour = localTime.hour();
  var localMinute = localTime.minute();

  var open = 'false';
  var closingInMins;
  var openingInMins;

  operatingHours.Config.forEach(config =>
  {
    if (config.Day === localDayName)
    {
      // Always open
      if (config.StartTime.Hours === 0 &&
          config.StartTime.Minutes === 0 &&
          config.EndTime.Hours === 0 &&
          config.EndTime.Minutes === 0)
      {
        open = 'true';
        closingInMins = -1;
        openingInMins = -1;
      }
      else
      {
        // Check start time
        var startOk = false;

        if ((config.StartTime.Hours < localHour) ||
            ((config.StartTime.Hours === localHour) &&
              (config.StartTime.Minutes <= localMinute)))
        {
          startOk = true;
        }

        // Check end time
        var endOk = false;

        if ((config.EndTime.Hours > localHour) ||
            ((config.EndTime.Hours === localHour) &&
              (config.EndTime.Minutes >= localMinute)))
        {
          endOk = true;
        }

        if (startOk && endOk)
        {
          open = 'true';

          var hoursUntilClosing;

          if (config.EndTime.Hours < localHour)
          {
            var hoursUntilClosing = (config.EndTime.Hours - (localHour - 12)) + 12;
          }
          else
          {
            hoursUntilClosing = config.EndTime.Hours - localHour;
          }

          closingInMins = (hoursUntilClosing * 60) + (config.EndTime.Minutes - localMinute);
        }
        else
        {
          var hoursUntilOpening;

          if (config.StartTime.Hours < localHour)
          {
            var hoursUntilOpening = (config.StartTime.Hours - (localHour - 12)) + 12;
          }
          else
          {
            hoursUntilOpening = config.StartTime.Hours - localHour;
          }

          openingInMins = (hoursUntilOpening * 60) + (config.StartTime.Minutes - localMinute);
        }
      }
    }
  });

  var openStatus = {
    Name: operatingHours.Name,
    Id: operatingHours.Id,
    Arn: operatingHours.Arn,
    Open: open,
    ClosingInMins: closingInMins,
    OpeningInMins: openingInMins
  };

  return openStatus;
}

/**
 * Evaluate operating hours returning a map with an entry for each
 * configured operating hours
 */
module.exports.evaluateOperatingHours = async function (configTable)
{
  var operatingHours = await configUtils.getOperatingHours(configTable);
  var now = moment();
  var openStatus = {};

  operatingHours.forEach(hours => {
    openStatus[hours.Name] = module.exports.evaluateSingleOperatingHours(hours, now);
  });

  // console.log('[INFO] computed open status: ' + JSON.stringify(openStatus, null, 2));

  return openStatus;
}
