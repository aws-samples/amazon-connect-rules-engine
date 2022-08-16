// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var LRU = require('lru-cache');
var dynamoUtils = require('./DynamoUtils.js');
var moment = require('moment');

/**
 * 5 minute LRU cache for performance
 */
var configCacheOptions = { max: 100, ttl: 1000 * 60 * 5 };
var configCache = new LRU(configCacheOptions);

var lastChangeTimestamp = undefined;

/**
 * Check for last change and clear config cache if required
 * return true if the model was sane, false if cache was cleared
 */
module.exports.checkLastChange = async function(configTable)
{
  // Check for model and config changes
  var latestChangeTimestamp = await module.exports.getLastChangeTimestamp(configTable);

  if (latestChangeTimestamp !== lastChangeTimestamp)
  {
    console.info(`Model change detected at: ${latestChangeTimestamp} reload of config is required, clearing local cache`);
    configCache.reset();
    lastChangeTimestamp = latestChangeTimestamp;
    return false;
  }

  return true;
}

/**
 * Loads all config items
 */
module.exports.getConfigItems = async function(configTable)
{
    var configItems = configCache.get('allConfigItems');

    if (configItems !== undefined)
    {
      return configItems;
    }

    configItems = await dynamoUtils.getConfigItems(configTable);

    configCache.set('allConfigItems', configItems);

    return configItems;
}

/**
 * Fetches the cached operating hours
 */
module.exports.getOperatingHours = async function(configTable)
{
  var allItems = await module.exports.getConfigItems(configTable);
  var operatingHours = allItems.OperatingHours;

  if (operatingHours !== undefined)
  {
    return operatingHours;
  }
  else
  {
    return [];
  }
}

/**
 * Fetches the cached contact flows
 */
module.exports.getContactFlows = async function(configTable)
{
  var allItems = await module.exports.getConfigItems(configTable);
  var contactFlows = allItems.ContactFlows;

  if (contactFlows !== undefined)
  {
    return contactFlows;
  }
  else
  {
    return [];
  }
}

/**
 * Fetches the cached lambda functions flows
 */
module.exports.getLambdaFunctions = async function(configTable)
{
  var allItems = await module.exports.getConfigItems(configTable);
  var lambdaFunctions = allItems.LambdaFunctions;

  if (lambdaFunctions !== undefined)
  {
    return lambdaFunctions;
  }
  else
  {
    return [];
  }
}

/**
 * Fetches the cached prompts
 */
module.exports.getPrompts = async function(configTable)
{
  var allItems = await module.exports.getConfigItems(configTable);
  var prompts = allItems.Prompts;

  if (prompts !== undefined)
  {
    return prompts;
  }
  else
  {
    return [];
  }
}

/**
 * Fetches the cached lex bots
 */
module.exports.getLexBots = async function(configTable)
{
  var allItems = await module.exports.getConfigItems(configTable);
  var lexBots = allItems.LexBots;

  if (lexBots !== undefined)
  {
    return lexBots;
  }
  else
  {
    return [];
  }
}

/**
 * Fetches the cached routing profiles
 */
module.exports.getRoutingProfiles = async function(configTable)
{
  var allItems = await module.exports.getConfigItems(configTable);
  var routingProfiles = allItems.RoutingProfiles;

  if (routingProfiles !== undefined)
  {
    return routingProfiles;
  }
  else
  {
    return [];
  }
}

/**
 * Fetches the cached queues
 */
module.exports.getQueues = async function(configTable)
{
  var allItems = await module.exports.getConfigItems(configTable);
  var queues = allItems.Queues;

  if (queues !== undefined)
  {
    return queues;
  }
  else
  {
    return [];
  }
}

/**
 * Fetches the cached phone numbers
 */
module.exports.getPhoneNumbers = async function(configTable)
{
  var allItems = await module.exports.getConfigItems(configTable);
  var phoneNumbers = allItems.PhoneNumbers;

  if (phoneNumbers !== undefined)
  {
    return phoneNumbers;
  }
  else
  {
    return [];
  }
}

/**
 * Fetches the cached holidays
 */
module.exports.getHolidays = async function(configTable)
{
  var allItems = await module.exports.getConfigItems(configTable);
  var holidays = allItems.Holidays;

  if (holidays !== undefined)
  {
    return holidays;
  }
  else
  {
    return [];
  }
}

module.exports.getCallCentreTimeZone = async function(configTable)
{
  var allItems = await module.exports.getConfigItems(configTable);
  return allItems.CallCentreTimeZone;
}

/**
 * Fetches the last change to the rule sets or rules this can be used to safely
 * cache data until the next change. This will set last change to now if not
 * already set
 */
module.exports.getLastChangeTimestamp = async function(configTable)
{
  var configItem = await module.exports.getUncachedConfigItem(configTable, 'LastChangeTimestamp');

  if (configItem === undefined)
  {
    configItem = await module.exports.setLastChangeTimestampToNow(configTable);
  }

  return configItem.configData;
}

/**
 * Update the last change to now
 */
module.exports.setLastChangeTimestampToNow = async function(configTable)
{
  var lastChange = moment.utc().format();
  await module.exports.updateConfigItem(configTable, 'LastChangeTimestamp', lastChange);
  return lastChange;
}

/**
 * Fetches an uncached config item
 */
module.exports.getUncachedConfigItem = async function (configTable, configKey)
{
  try
  {
    return await dynamoUtils.getConfigItem(configTable, configKey);
  }
  catch (error)
  {
    console.log('[ERROR] failed to uncached config item', error);
    throw error;
  }
}

/**
 * Updates a config item clearing the cache
 */
module.exports.updateConfigItem = async function (configTable, configKey, configValue)
{
  try
  {
    await dynamoUtils.updateConfigItem(configTable, configKey, configValue);
    configCache.reset();
  }
  catch (error)
  {
    console.log('[ERROR] failed to update config item', error);
    throw error;
  }
}
