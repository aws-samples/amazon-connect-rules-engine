// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const dynamoUtils = require('./DynamoUtils');
const commonUtils = require('./CommonUtils');
const { UnauthorizedError } = require('./ErrorCodeUtils');

/**
 * Logs a request
 */
module.exports.logRequest = (event) =>
{
  var clone = commonUtils.clone(event);

  // Clear the API key headers
  if (clone.headers)
  {
    delete clone.headers['x-api-key'];
  }

  if (clone.multiValueHeaders)
  {
    delete clone.multiValueHeaders['x-api-key'];
  }

  if (clone.requestContext !== undefined && clone.requestContext.identity !== undefined)
  {
    delete clone.requestContext.identity.apiKey;
  }

  console.info(JSON.stringify(clone, null, 2));
};

/**
 * Verifies a request API key
 */
module.exports.verifyAPIKey = async (event) =>
{
  var apiKey = event.requestContext.identity.apiKey;

  if (apiKey === undefined || apiKey === '')
  {
    console.error('Missing API key');
    throw new UnauthorizedError('Missing API key');
  }
  else
  {
    var user = await dynamoUtils.getUserByAPIKey(process.env.USERS_TABLE, apiKey);

    if (user === undefined || user.enabled === false)
    {
      console.error('Failed to find active user for API key');
      throw new UnauthorizedError('Invalid API key, no active user found');
    }

    console.info(`Authorised user: ${user.firstName} ${user.lastName} (${user.emailAddress})`);

    return user;
  }
};

/**
 * Requires that the user have one of these roles
 */
module.exports.requireRole = (user, roles) =>
{
  if (!roles.includes(user.userRole))
  {
    console.error(`Insufficient role found, required: ${roles.join()} found: ${user.userRole}`);
    throw new Error('Insufficient role');
  }
};

function getValidOrigins() {
  return JSON.parse(process.env.VALID_ORIGINS);
}

/**
 * Verifies a request origin
 */
module.exports.checkOrigin = (event) =>
{
  var validOrigins = getValidOrigins();

  if (validOrigins.length > 0)
  {
    var origin = event.headers.origin;

    if (origin === undefined)
    {
      origin = event.headers.Origin;
    }

    if (validOrigins.length > 0 && !validOrigins.includes(origin))
    {
      console.error('Invalid origin: ' + origin);
      throw new Error('Invalid origin: ' + origin);
    }
  }
};

/**
 * Export state parameters that are simple strings
 */
module.exports.buildCustomerStateResponse = function(customerState)
{
  var response = {};

  var keys = Object.keys(customerState);

  keys.forEach(key => {
    var value = customerState[key];

    if (typeof value === 'string')
    {
      response[key] = value;
    }
  });

  return response;
}

/**
 * Creates a successful APIGW response
 */
module.exports.buildSuccessfulResponse = (data) =>
{
  var validOrigins = getValidOrigins();

  const response = {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': validOrigins[0],
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  };

  return response;
};

/**
 * Creates a failure APIGW response
 */
module.exports.buildFailureResponse = (code, body) =>
{
  var validOrigins = getValidOrigins();

  const response =
  {
    statusCode: code,
    headers: {
      'Access-Control-Allow-Origin': validOrigins[0],
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      data: body
    })
  };
  console.error('Made failure response: ' + JSON.stringify(response, null, ' '));
  return response;
};

/**
 * Creates an errored APIGW response
 */
module.exports.buildErrorResponse = (error) =>
{
  var validOrigins = getValidOrigins();

  const response =
  {
    statusCode: error.statusCode ? error.statusCode : 500,
    headers: {
      'Access-Control-Allow-Origin': validOrigins[0],
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      error: error.message
    })
  };
  console.error('Made error response: ' + JSON.stringify(response, null, ' '));
  return response;
};

/**
 * Require a parameters
 */
module.exports.requireParameter = function (fieldName, fieldValue)
{
  if (fieldValue === undefined)
  {
    console.error(`Required field is missing: ${fieldName}`);
    throw new Error(`Required field is missing: ${fieldName}`);
  }
}
