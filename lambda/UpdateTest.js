// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Updates an existing test in DynamoDB
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
    var testId = body.testId;
    var name = body.name;
    var productionReady = body.productionReady;
    var folder = body.folder;
    var testReference = body.testReference;
    var description = body.description;
    var endPoint = body.endPoint;
    var testDateTime = body.testDateTime;
    var customerPhoneNumber = body.customerPhoneNumber;
    var payload = body.payload;
    var contactAttributes = body.contactAttributes;

    await dynamoUtils.updateTest(process.env.TESTS_TABLE, testId, name,
        productionReady, folder, testReference, description, endPoint,
        testDateTime, customerPhoneNumber, payload, contactAttributes);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'Test updated successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to update test', error);
    return requestUtils.buildErrorResponse(error);
  }
};
