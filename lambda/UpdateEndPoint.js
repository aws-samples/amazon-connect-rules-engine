// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Updates an existing end point in DyanmoDB
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var body = JSON.parse(event.body);
    var endPointId = body.endPointId;
    var description = body.description;
    var inboundNumbers = body.inboundNumbers;
    var enabled = body.enabled;

    if (endPointId === undefined)
    {
      throw new Error('Missing end point id');
    }

    if (description === undefined)
    {
      description = '';
    }

    if (inboundNumbers === undefined)
    {
      inboundNumbers = [];
    }

    if (enabled === undefined)
    {
      enabled = false;
    }

    await dynamoUtils.updateEndPoint(process.env.END_POINTS_TABLE,
      endPointId, description, inboundNumbers, enabled);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      message: 'End point updated successfully'
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to update end point', error);
    return requestUtils.buildErrorResponse(error);
  }
};
