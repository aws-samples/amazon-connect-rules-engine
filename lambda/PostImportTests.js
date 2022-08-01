// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Handles post import tests including deleting dangling tests
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var body = JSON.parse(event.body);

    var importedTests = body.importedTests;

    console.log('[INFO] about to perform post import actions');

    var existingTests = await dynamoUtils.getTests(process.env.TESTS_TABLE);

    var deletedCount = 0;

    for (var i = 0; i < existingTests.length; i++)
    {
      var existingTest = existingTests[i];
      var newTest = importedTests.find(test => (test.folder === existingTest.folder && test.name === existingTest.name));

      if (newTest === undefined)
      {
        await dynamoUtils.deleteTest(process.env.TESTS_TABLE, existingTest.testId);
        deletedCount++;
      }
    }

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    console.log(`[INFO] successfully deleted: ${deletedCount} dangling tests`);

    return requestUtils.buildSuccessfulResponse({
      deletedCount: deletedCount
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to perform post import actions', error);
    return requestUtils.buildErrorResponse(error);
  }
};
