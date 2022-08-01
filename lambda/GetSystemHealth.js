// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Fetches system health of contact flows
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    await configUtils.checkLastChange(process.env.CONFIG_TABLE);
    var configItems = await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    var response = {
      systemHealth: {
        status: 'HEALTHY'
      }
    };

    response.systemHealth.contactFlows = await connectUtils.checkContactFlowStatus(process.env.INSTANCE_ID,
      process.env.STAGE, process.env.SERVICE, configItems);

    if (response.systemHealth.contactFlows.status === 'UNHEALTHY')
    {
      response.systemHealth.status = 'UNHEALTHY';
    }

    return requestUtils.buildSuccessfulResponse(response);
  }
  catch (error)
  {
    console.log('[ERROR] failed to fetch system health', error);
    return requestUtils.buildErrorResponse(error);
  }
};

