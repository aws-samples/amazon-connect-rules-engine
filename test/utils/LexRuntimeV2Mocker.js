const AWS = require('aws-sdk');

/**
 *  This sets up a LexV2 runtime instance that can be mocked by aws-sdk-mock
 */
module.exports.setupMockLexRuntimeV2 = function (AWSMock, lexUtils)
{
  AWSMock.mock('LexRuntimeV2', 'recognizeText', (function (params, callback)
  {
    if (params.text === 'Technical support')
    {
      callback(null, makeMatchedIntentResponse('TechnicalSupport', 0.8));
    }
    else if (params.text === 'Yes')
    {
      callback(null, makeMatchedIntentResponse('Yes', 1.0));
    }
    else
    {
      callback(null, makeFallbackResponse());
    }
  }));

  AWSMock.mock('LexRuntimeV2', 'deleteSession', (function (params, callback)
  {
    callback(null, {});
  }));

  lexUtils.setLexRuntimeV2(new AWS.LexRuntimeV2())
}

/**
 * Makes a matched intent response
 */
function makeMatchedIntentResponse(intent, confidence)
{
  var response = {
    interpretations: [
      {
        intent: {
          name: intent
        },
        nluConfidence: {
          score: confidence
        }
      }
    ]
  };

  return response;
}

/**
 * Makes a fallback response
 */
function makeFallbackResponse()
{
  var response = {
    interpretations: [
      {
        intent: {
          name: 'Fallback'
        }
      }
    ]
  };

  return response;
}
