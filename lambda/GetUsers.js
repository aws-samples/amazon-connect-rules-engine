// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches all users
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var users = await dynamoUtils.getUsers(process.env.USERS_TABLE);

    return requestUtils.buildSuccessfulResponse({
      users: users
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to users', error);
    return requestUtils.buildErrorResponse(error);
  }
};
