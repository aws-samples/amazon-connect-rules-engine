// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');
var lambdaUtils = require('./utils/LambdaUtils.js');

var moment = require('moment-timezone');

const { v4: uuidv4 } = require('uuid');

/**
 * Handles batch rule execution by distributing them to
 * the longer lived BatchInferenceRunner Lambda.
 * Takes either a testIds array or looks up tests using the input
 * folder and recursive flags
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    // Validate the request and parse the body to find the test ids
    if (event.body === undefined)
    {
      throw new Error('Invalid request, requires event.body = { testIds: ["..."] }');
    }

    var body = JSON.parse(event.body);

    var testIds = [];
    var providedTestIds = false;

    var folder = body.folder;

    if (folder === undefined)
    {
      throw new Error('Invalid request, folder is required');
    }

    var recursive = (body.recursive === true);

    // Validate we have either (a list of test ids) or (a folder and a recursive flag)
    if (body.testIds !== undefined)
    {
      if (!Array.isArray(body.testIds) || body.testIds.length === 0)
      {
        throw new Error('Invalid request, testIds parameter must be a non-empty array');
      }
      testIds = body.testIds;
      providedTestIds = true;
    }
    else
    {
      // Load tests and filter by folder respecting the recursive flag
      var tests = await dynamoUtils.getTests(process.env.TESTS_TABLE);

      tests.forEach(test => {
        if (recursive)
        {
          if (test.folder.startsWith(folder))
          {
            testIds.push(test.testId);
          }
        }
        else
        {
          if (test.folder === folder)
          {
            testIds.push(test.testId);
          }
        }
      });
    }

    var start = moment();

    // Create a new batch run id at time now for this user
    var batchId = await dynamoUtils.insertBatch(process.env.VERIFY_TABLE, user, process.env.VERSION, folder, recursive, providedTestIds, testIds, 'RUNNING', start);

    console.info(`Starting batch: ${batchId} containing ${testIds.length} test(s) for ${user.firstName} ${user.lastName} (${user.emailAddress})`);

    // Create a batch run request passing the API key
    var batchRequest = {
      batchId: batchId,
      requestContext: {
        identity: {
          apiKey: event.requestContext.identity.apiKey
        }
      }
    };

    // Start a long running test runner
    await lambdaUtils.invokeAsync(process.env.BATCH_RUNNER_ARN, batchRequest);

    console.info(`Sucessfully started batch: ${batchId} containing ${testIds.length} test(s) for ${user.firstName} ${user.lastName} (${user.emailAddress})`);

    return requestUtils.buildSuccessfulResponse({
      batchId: batchId,
      testIds: testIds
    });
  }
  catch (error)
  {
    console.error('Failed to start batch inference', error);
    return requestUtils.buildErrorResponse(error);
  }
}
