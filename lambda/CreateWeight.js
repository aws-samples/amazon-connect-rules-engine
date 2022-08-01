// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

const { v4: uuidv4 } = require('uuid');

/**
 * Creates a new weight for a rule in DynamoDB
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
    var ruleSetId = body.ruleSetId;
    var ruleId = body.ruleId;
    var field = body.field;
    var operation = body.operation;
    var value = body.value;
    var weight = body.weight;

    var newWeight = {
      weightId: uuidv4(),
      field: field,
      operation: operation,
      value: value,
      weight: weight
    };

    await dynamoUtils.insertWeight(process.env.RULES_TABLE, ruleSetId, ruleId, newWeight);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'Weight created successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to create weight', error);
    return requestUtils.buildErrorResponse(error);
  }
};

