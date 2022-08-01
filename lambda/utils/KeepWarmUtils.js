// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var moment = require('moment');
const { v4: uuidv4 } = require('uuid');

var warmTimestamp = undefined;
var functionId = undefined;

/**
 * Creates a keep warm request for a function
 */
module.exports.createKeepWarmRequest = function(name, arn)
{
  var request = {
    keepWarm: {
      name: name,
      arn: arn,
    }
  };
  return request;
}

/**
 * Checks for a health check request which has the structure from createKeepWarmRequest()
 */
module.exports.isKeepWarmRequest = function(request)
{
  if (request.keepWarm !== undefined &&
      request.keepWarm.name !== undefined &&
      request.keepWarm.arn !== undefined)
  {
    console.info(`Detected keep warm request for function: ${request.keepWarm.name}`);
    return true;
  }

  return false;
}

/**
 * Checks for a health check response which has the structure from makeKeepWarmResponse()
 */
module.exports.isKeepWarmResponse = function(response)
{
  if (response.keepWarm !== undefined &&
      response.keepWarm.name !== undefined &&
      response.keepWarm.arn !== undefined)
  {
    return true;
  }

  console.info(`Detected non keep warm response: ${JSON.stringify(response, null, 2)}`);

  return false;
}

/**
 * Creates a keep warm response, tracking cold starts via the warmTimestamp field
 * and providing an optional sleep time for warm functions
 */
module.exports.makeKeepWarmResponse = async function(request, sleepTime = 0)
{
  var coldStart = false;

  var now = moment();

  if (warmTimestamp === undefined || functionId === undefined)
  {
    coldStart = true;
    warmTimestamp = now;
    functionId = uuidv4();
  }
  else
  {
    if (sleepTime > 0)
    {
      console.info(`Sleeping for: ${sleepTime} millis`);
      await sleep(sleepTime);
    }
  }

  var response = {
    keepWarm: {
      id: functionId,
      name: request.keepWarm.name,
      arn: request.keepWarm.arn,
      coldStart: coldStart,
      runningTime: now.diff(warmTimestamp, 'seconds')
    }
  };

  console.info(`Made keep warm response: ${JSON.stringify(response, null, 2)}`);
  return response;
}

/**
 * Sleep for specified millis
 */
function sleep(time)
{
  return new Promise((resolve) => setTimeout(resolve, time));
}

