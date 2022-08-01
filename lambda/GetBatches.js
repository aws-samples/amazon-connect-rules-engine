// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches batches one by one or fetches a list
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var batchId = undefined;
    var mineOnly = false;
    var errorsOnly = false;
    var limit = 50;

    // Do some filtering of the results
    if (event.queryStringParameters !== null)
    {
      batchId = event.queryStringParameters.batchId;
      mineOnly = event.queryStringParameters.mineOnly === 'true';
      errorsOnly = event.queryStringParameters.errorsOnly === 'true';
    }

    console.info(`Got mineOnly: ${mineOnly} errorsOnly: ${errorsOnly} batchId: ${batchId} limit: ${limit}`);

    var batches = [];

    if (batchId !== undefined)
    {
      var batch = await dynamoUtils.getBatch(process.env.VERIFY_TABLE, batchId);
      batches = [ batch ];
    }
    else
    {
      var rawBatches = await dynamoUtils.getBatches(process.env.VERIFY_TABLE);

      // Filter results on errors / warnings only or filter by just the current user
      if (mineOnly || errorsOnly)
      {
        rawBatches.forEach(batch => {

          var accepted = true;

          if (mineOnly && (batch.userId !== user.userId))
          {
            accepted = false;
          }

          if (errorsOnly && (batch.success === true && batch.warning === false))
          {
            accepted = false;
          }

          if (accepted)
          {
            batches.push(batch);
          }
        });
      }
      else
      {
        batches = rawBatches;
      }
    }

    // Sort by descending start time then clamp to limit
    batches.sort(function(a, b)
    {
      return b.startTime.localeCompare(a.startTime);
    });

    if (batches.length > limit)
    {
      console.info('Limiting results to: ' + limit);
      batches = batches.slice(0, limit);
    }

    return requestUtils.buildSuccessfulResponse({
      batches: batches
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to load batches', error);
    return requestUtils.buildErrorResponse(error);
  }
};
