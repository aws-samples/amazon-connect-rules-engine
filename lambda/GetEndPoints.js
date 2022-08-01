// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches all end points
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var endPoints = await dynamoUtils.getEndPoints(process.env.END_POINTS_TABLE);

    return requestUtils.buildSuccessfulResponse({
      endPoints: endPoints
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to get end points', error);
    return requestUtils.buildErrorResponse(error);
  }
};
