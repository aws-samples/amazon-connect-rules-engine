// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils');
var dynamoUtils = require('./utils/DynamoUtils');
var configUtils = require('./utils/ConfigUtils');
var rulesEngine = require('./utils/RulesEngine');
var inferenceUtils = require('./utils/InferenceUtils');

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
    var id1 = event.queryStringParameters.id1;
    var id2 = event.queryStringParameters.id2;
    var id3 = event.queryStringParameters.id3;

    if (type === undefined || id1 === undefined)
    {
      return buildSuccessfulResponse({
        success: false,
        message: 'Invalid inputs'
      });
    }

    switch (type)
    {
      case 'batch':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);
        logDelete(user, type, id1);
        await dynamoUtils.deleteBatch(process.env.VERIFY_TABLE, id1);
        break;
      }
      case 'test':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);
        logDelete(user, type, id1);
        await dynamoUtils.deleteTest(process.env.TESTS_TABLE, id1);
        break;
      }
      case 'user':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR']);
        logDelete(user, type, id1);
        await dynamoUtils.deleteUser(process.env.USERS_TABLE, id1);
        break;
      }
      case 'rule':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);
        logDelete(user, type, id1, id2);
        await dynamoUtils.deleteRule(process.env.RULES_TABLE, id1, id2);
        break;
      }
      case 'weight':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);
        logDelete(user, type, id1, id2, id3);
        await dynamoUtils.deleteWeight(process.env.RULES_TABLE, id1, id2, id3);
        break;
      }
      case 'endpoint':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);
        logDelete(user, type, id1);
        return await deleteEndPoint(id1);
      }
      case 'holiday':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);
        logDelete(user, type, id1);
        return await deleteHoliday(id1);
      }
      case 'ruleset':
      {
        requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);
        logDelete(user, type, id1, id2);
        return await deleteRuleSet(id1);
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
      success: true,
      message: 'Object deleted successfully'
    });
  }
  catch (error)
  {
    console.error('Failed to delete object', error);
    return requestUtils.buildSuccessfulResponse({
      success: false,
      message: 'Failed to delete object',
      cause: error.message
    });
  }
};

/**
 * Logs the upcoming delete with optional id2 and id3
 */
function logDelete(user, type, id1, id2 = undefined, id3 = undefined)
{
  if (id2 !== undefined && id3 !== undefined)
  {
    console.info(`User ${user.firstName} ${user.lastName} (${user.emailAddress}) is deleting: ${type} with id1: ${id1}, id2: ${id2} and id3: ${id3}`);
  }
  else if (id2 !== undefined)
  {
    console.info(`User ${user.firstName} ${user.lastName} (${user.emailAddress}) is deleting: ${type} with id1: ${id1} and id2: ${id2}`);
  }
  else
  {
    console.info(`User ${user.firstName} ${user.lastName} (${user.emailAddress}) is deleting: ${type} with id1: ${id1}`);
  }
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
    return requestUtils.buildSuccessfulResponse({
      success: false,
      message: 'Holiday not found'
    });
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

  return requestUtils.buildSuccessfulResponse({
    success: true,
    message: 'Holiday deleted successfully'
  });
}

/**
 * Deletes an end point
 */
async function deleteEndPoint(endPointId)
{
  var endPoints = await dynamoUtils.getEndPoints(process.env.END_POINTS_TABLE);
  var endPoint = endPoints.find(endPoint => endPoint.endPointId === endPointId);

  if (endPoint === undefined)
  {
    return requestUtils.buildSuccessfulResponse({
      success: false,
      message: 'End point not found'
    });
  }

  var endPointName = endPoint.name;

  // Check and clear the ruleset cache
  if (!await configUtils.checkLastChange(process.env.CONFIG_TABLE))
  {
    inferenceUtils.clearCache();
  }

  // Check for rule sets bound to this end point
  await inferenceUtils.cacheRuleSets(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

  var ruleSet = inferenceUtils.getRuleSetByEndPoint(endPointName);

  if (ruleSet !== undefined)
  {
    return requestUtils.buildSuccessfulResponse({
      success: false,
      message: 'End point cannot be deleted, in use from: ' + ruleSet.name
    });
  }

  // Delete the dangling rule set
  await dynamoUtils.deleteEndPoint(process.env.END_POINTS_TABLE, endPointId);

  // Mark the last change to now
  await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

  return requestUtils.buildSuccessfulResponse({
    success: true,
    message: 'End point deleted successfully'
  });
}

/**
 * Deletes a rule set
 */
async function deleteRuleSet(ruleSetId)
{
  // Load all rule sets and rules
  var ruleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

  // Find this rule set
  var ruleSet = ruleSets.find(rs => rs.ruleSetId === ruleSetId);

  if (ruleSet === undefined)
  {
    return requestUtils.buildSuccessfulResponse({
      success: false,
      message: 'Rule set not found'
    });
  }

  // Check to see if any rules point to this rule set
  var referencingRuleSets = rulesEngine.getReferringRuleSets(ruleSet, ruleSets);

  var referencingRuleSetNames = Object.keys(referencingRuleSets);

  if (referencingRuleSetNames.length > 0)
  {
    var names = [];
    referencingRuleSetNames.forEach(name => {
      names.push(`${name} (Count: ${referencingRuleSets[name].length})`);
    });

    return requestUtils.buildSuccessfulResponse({
      success: false,
      message: 'Rule set cannot be deleted, in use from: ' + names.join(', ')
    });
  }

  await dynamoUtils.deleteRuleSetAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE, ruleSet);

  // Mark the last change to now
  await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

  return requestUtils.buildSuccessfulResponse({
    success: true,
    message: 'Rule set deleted successfully'
  });
}
