// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Creates a new test in DynamoDB, tests don't need to have a unique name
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

    var testId = await dynamoUtils.insertTest(process.env.TESTS_TABLE,
      name, productionReady, folder, testReference, description, endPoint,
      testDateTime, customerPhoneNumber, payload, contactAttributes);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      testId: testId
    });

  }
  catch (error)
  {
    console.log('[ERROR] failed to create test', error);
    return requestUtils.buildErrorResponse(error);
  }
};

