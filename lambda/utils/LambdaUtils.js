
var AWS = require('aws-sdk');

AWS.config.update({region: process.env.REGION});

var lambda = new AWS.Lambda();

/**
 * Allow injection of mock Lambda runtime
 */
module.exports.setLambda = function(newLambda)
{
  lambda = newLambda;
}

/**
 * Lists the connect and integration Lambda functions in this
 * account for the requested stage and service
 */
module.exports.listConnectLambdaFunctions = async function (stage, service)
{
  try
  {
    console.log('[INFO] loading Connect Lambda functions');

    var functions = [];
    var request = {};

    var results = await lambda.listFunctions(request).promise();

    functions = functions.concat(results.Functions.filter(lambdaFunction => isConnectFunction(stage, service, lambdaFunction.FunctionName)));

    while (results.NextMarker)
    {
      request.Marker = results.NextMarker;
      results = await lambda.listFunctions(request).promise();
      functions = functions.concat(results.Functions.filter(lambdaFunction => isConnectFunction(stage, service, lambdaFunction.FunctionName)));
    }

    functions.sort(function (a, b) {
      return a.FunctionName.toLowerCase().localeCompare(b.FunctionName.toLowerCase());
    });

    return functions;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list filtered functions for account', error);
    throw error;
  }
};

/**
 * Is this a connect Lambda function
 */
function isConnectFunction(stage, service, functionName)
{
  var prefix = `${stage}-${service}-`;
  return functionName.startsWith(prefix);
}

/**
 * Fetches a map of Lambda function short names against their ARN.
 *
 * Result:
 * {
 *    connectupdatestate: {
 *      arn: "arn:aws:lambda:ap-southeast-2:<accountNumber>:function:dev-rules-engine-connectupdatestate"
 *    },
 *    ...
 * }
 */
module.exports.getConnectLambdaFunctionMap = function (stage, service, lambdaFunctions)
{
  try
  {
    var results = {};

    var prefix = `${stage}-${service}-`;

    lambdaFunctions.forEach(lambdaFunction => {
      var shortName = lambdaFunction.Name.substring(prefix.length);

      results[shortName] = {
        arn: lambdaFunction.Arn
      };
    });

    return results;
  }
  catch (error)
  {
    console.log('[ERROR] failed to build Lambda function map', error);
    throw error;
  }
}

/**
 * Invokes the requested Lambda function asynchronously
 */
module.exports.invokeAsync = async function(functionArn, payload)
{
  try
  {
    var params = {
      FunctionName: functionArn,
      InvocationType: 'Event',
      Payload: JSON.stringify(payload)
    };

    await lambda.invoke(params).promise();
  }
  catch (error)
  {
    console.log('[ERROR failed to invoke Lambda function', error);
    throw error;
  }
}

/**
 * Invokes the requested Lambda function synchronously
 */
module.exports.invokeSync = async function(functionArn, payload)
{
  try
  {
    var params = {
      FunctionName: functionArn,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    };

    var response = await lambda.invoke(params).promise();

    if (response.FunctionError !== undefined)
    {
      var errorMessage = JSON.parse(response.Payload).errorMessage;
      throw new Error(errorMessage);
    }

    return response.Payload;
  }
  catch (error)
  {
    console.error(`Failed to invoke Lambda function synchronously: ${functionArn}`, error);
    throw error;
  }
}

