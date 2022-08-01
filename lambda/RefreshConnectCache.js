// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var lambdaUtils = require('./utils/LambdaUtils.js');

/**
 * Caches Connect data in DynamoDB, triggered via admin page button
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    await lambdaUtils.invokeAsync(process.env.CACHE_LAMBDA_ARN, '');

    console.log('[INFO] cache refresh is underway');

    return requestUtils.buildSuccessfulResponse({
      success: 'true'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to initialise connect cache refresh', error);
    return requestUtils.buildErrorResponse(error);
  }
};


