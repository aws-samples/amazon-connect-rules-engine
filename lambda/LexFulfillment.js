// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const configUtils = require('./utils/ConfigUtils');
const keepWarmUtils = require('./utils/KeepWarmUtils');
const inferenceUtils = require('./utils/InferenceUtils');
const commonUtils = require('./utils/CommonUtils');

/**
 * Called by Lex to handle bot fulfilment, primary function
 * is to copy the full lex response into customer state
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);

    // Check for warm up message and bail out after cache loads
    if (keepWarmUtils.isKeepWarmRequest(event))
    {
      return await keepWarmUtils.makeKeepWarmResponse(event, 0);
    }

    requestUtils.requireParameter('sessionId', event.sessionId);

    var contactId = event.sessionId;

    // Process live contact events and store the lex response in state
    if (!contactId.startsWith('test-'))
    {
      console.info('Found non-test lex fulfilment, updating state for contact id: ' + contactId);

      var botName = event.bot.name;
      var prefix = `${process.env.STAGE}-${process.env.SERVICE}-`;

      if (botName.startsWith(prefix))
      {
        botName = botName.substring(prefix.length);
      }

      // Normalise all non-alpha chracters with underscores
      botName = botName.replace(/[^0-9a-z]/gi, '_');

      var stateKey = `LexResponses.${botName}`;

      // Load the current customer state and update the LexResponses[bot name]
      // field with the full lex bot response
      var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
      var stateToSave = new Set();
      inferenceUtils.updateState(customerState, stateToSave, stateKey, event);

      console.info('State to save: ' + JSON.stringify(Array.from(stateToSave)));
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
    }
    else
    {
      console.info('Skipping update of state due to missing or test contact id: ' + contactId);
    }

    var sessionAttributes = undefined;

    if (event.sessionState !== undefined && event.sessionState.sessionAttributes !== undefined)
    {
      sessionAttributes = event.sessionState.sessionAttributes;
    }

    var requestAttributes = event.requestAttributes;

    // See https://docs.aws.amazon.com/lexv2/latest/dg/lambda.html
    var response =
    {
      sessionState: {
        sessionId: event.sessionId,
        sessionAttributes: sessionAttributes,
        requestAttributes: requestAttributes,
        dialogAction: {
          type: 'Close'
        },
        fulfillmentState: 'Fulfilled',
        messages: [
          {
            contentType: 'PlainText',
            content: 'Intent was fulfilled'
          }
        ],
        intent: commonUtils.clone(event.interpretations[0].intent)
      }
    };

    response.sessionState.intent.state = 'Fulfilled';
    response.sessionState.intent.confirmationState = 'Confirmed';

    console.info(`Made lex response: ${JSON.stringify(response, null, 2)}`);

    return response;
  }
  catch (error)
  {
    console.error('Failed to fulfil Lex bot', error);
    throw error;
  }
};

