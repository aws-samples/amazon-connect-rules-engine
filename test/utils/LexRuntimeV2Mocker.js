// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const AWS = require('aws-sdk');

/**
 *  This sets up a LexV2 runtime instance that can be mocked by aws-sdk-mock
 */
module.exports.setupMockLexRuntimeV2 = function (AWSMock, lexUtils)
{
  AWSMock.mock('LexRuntimeV2', 'recognizeText', (function (params, callback)
  {
    if (params.text.toLowerCase().includes('technical support'))
    {
      callback(null, makeMatchedIntentResponse('TechnicalSupport', 0.8));
    }
    else if (params.text === 'Yes')
    {
      callback(null, makeMatchedIntentResponse('Yes', 1.0));
    }
    else if (params.text === 'No')
    {
      callback(null, makeMatchedIntentResponse('No', 1.0));
    }
    else if (params.text.includes('September') || params.text.match(/[0-9]+(am|pm)/g))
    {
      callback(null, makeMatchedSlotResponse(0.9, params.text));
    }
    else if (params.text.includes('Dunno'))
    {
      callback(null, makeMatchedIntentResponse('nodata', 1.0));
    }
    else if (params.text.startsWith('oh '))
    {
      callback(null, makeMatchedSlotResponse(0.85, params.text));
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
 * Make an NLUInput friendly slot response
 */
function makeMatchedSlotResponse(confidence, value)
{
  var interpretedValue = value;

  // Treat as a date, handling some specific cases
  if (value.includes('September'))
  {
    interpretedValue = '2017-09-15';
  }
  // Treat as a time
  else if (value.match(/[0-9]+(am|pm)/g))
  {
    switch(value)
    {
      case '10am':
      {
        interpretedValue = '10:00';
        break;
      }
      case '2pm':
      {
        interpretedValue = '14:00';
        break
      }
      default:
      {
        // Just use it raw, shrug
        interpretedValue = value;
      }
    }
  }
  else if (value.startsWith('oh '))
  {
    interpretedValue = undefined;
  }

  var response = {
    sessionState: {
      activeContexts: [],
    },
    interpretations: [
      {
        intent: {
          name: 'intentdata',
          slots: {
            dataslot: {
              value: {
                originalValue: value,
                interpretedValue: interpretedValue,
                resolvedValues: [
                  interpretedValue
                ]
              }
            }
          },
          state: 'ReadyForFulfillment',
          confirmationState: 'None'
        },
        nluConfidence: confidence
      }
    ]
  };

  console.info('Made response: ' + JSON.stringify(response, null, 2));

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
          name: 'FallbackIntent'
        }
      }
    ]
  };

  return response;
}
