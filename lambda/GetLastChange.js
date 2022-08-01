// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Fetches the date of the last change to the rules data model
 * as an ISO860 UTC timestamp
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var lastChangeTimestamp = await configUtils.getLastChangeTimestamp(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      lastChangeTimestamp: lastChangeTimestamp
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to load last change timestamp', error);
    return requestUtils.buildErrorResponse(error);
  }
};
