// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var moment = require('moment-timezone');

var requestUtils = require('./utils/RequestUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Fetches connect configuration
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    // Check for config changes
    await configUtils.checkLastChange(process.env.CONFIG_TABLE);

    var contactFlows = await configUtils.getContactFlows(process.env.CONFIG_TABLE);
    var queues = await configUtils.getQueues(process.env.CONFIG_TABLE);
    var lambdaFunctions = await configUtils.getLambdaFunctions(process.env.CONFIG_TABLE);
    var phoneNumbers = await configUtils.getPhoneNumbers(process.env.CONFIG_TABLE);
    var timeZone = await configUtils.getCallCentreTimeZone(process.env.CONFIG_TABLE);
    var prompts = await configUtils.getPrompts(process.env.CONFIG_TABLE);
    var operatingHours = await configUtils.getOperatingHours(process.env.CONFIG_TABLE);
    var lexBots = await configUtils.getLexBots(process.env.CONFIG_TABLE);
    var routingProfiles = await configUtils.getRoutingProfiles(process.env.CONFIG_TABLE);

    var promptNames = [];
    prompts.forEach(prompt => {
      promptNames.push(prompt.Name);
    });

    var operatingHoursNames = [];
    operatingHours.forEach(operatingHour => {
      operatingHoursNames.push(operatingHour.Name);
    });

    var localDateTime = moment().tz(timeZone);

    return requestUtils.buildSuccessfulResponse({
      queues: queues,
      contactFlows: contactFlows,
      phoneNumbers: phoneNumbers,
      lambdaFunctions: lambdaFunctions,
      operatingHours: operatingHoursNames,
      routingProfiles: routingProfiles,
      timeZone: timeZone,
      prompts: promptNames,
      localDateTime: localDateTime.format(),
      localTime: localDateTime.format('hh:mm A'),
      lexBots: lexBots
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to load Connect data', error);
    return requestUtils.buildErrorResponse(error);
  }
};

