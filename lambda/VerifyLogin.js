// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');

/**
 * Checks the API key for a customer
 */
exports.handler = async(event, context) =>
{
  try
  {
    // requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    return requestUtils.buildSuccessfulResponse({user: user});
  }
  catch (error)
  {
    console.error('Failed to verify login', error);
    return requestUtils.buildErrorResponse(error);
  }
};


