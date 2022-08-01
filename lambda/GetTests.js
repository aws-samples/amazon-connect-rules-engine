// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches a single test by test id or all tests
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var tests = [];
    var testId = undefined;

    if (event.queryStringParameters !== null)
    {
      testId = event.queryStringParameters.testId;
    }

    if (testId !== undefined)
    {
      var test = await dynamoUtils.getTest(process.env.TESTS_TABLE, testId);
      tests = [ test ];
    }
    else
    {
      tests = await dynamoUtils.getTests(process.env.TESTS_TABLE);
    }

    return requestUtils.buildSuccessfulResponse({
      tests: tests
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to load tests', error);
    return requestUtils.buildErrorResponse(error);
  }
};

