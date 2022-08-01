const AWS = require('aws-sdk');

/**
 *  This sets up a Lambda runtime mocked by aws-sdk-mock
 */
module.exports.setupMockLambda = function (AWSMock, lambdaUtils)
{
  AWSMock.mock('Lambda', 'invoke', (function (params, callback)
  {
    console.info('Intercepting Lambda.invoke() request: ' + JSON.stringify(params, null, 2));
    callback(null, makeInvokeResponse(params));
  }));

  lambdaUtils.setLambda(new AWS.Lambda());
}

function makeInvokeResponse(params)
{
  var response = {
      StatusCode: 200,
      ExecutedVersion: '$LATEST',
      Payload: params.Payload
  };

  console.info('makeInvokeResponse() Making response: ' + JSON.stringify(response, null, 2));

  return response;
}
