// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var moment = require('moment');
var requestUtils = require('../utils/RequestUtils');
var dynamoUtils = require('../utils/DynamoUtils');
var inferenceUtils = require('../utils/InferenceUtils');
var commonUtils = require('../utils/CommonUtils');

/**
 * Simplest integration lambda function that echos
 * the request payload into the output state field
 */
exports.handler = async(event, context, callback) =>
{
  var contactId = undefined;
  var customerState = undefined;
  var stateToSave = new Set();

  try
  {
    requestUtils.logRequest(event);

    requestUtils.requireParameter('ContactId', event.ContactId);
    requestUtils.requireParameter('OriginalRequest', event.OriginalRequest);
    requestUtils.requireParameter('Payload', event.Payload);

    // The contact id is sourced from the initial contact id
    contactId = event.ContactId;

    // The original request is passed in as a string
    var originalRequest = event.OriginalRequest;

    // This could be JSON but is passed in as a string
    var payload = event.Payload;

    // See if a sleep time is configured
    var sleepTime = 0;
    var forcedError = undefined;

    try
    {
      var parsedPayload = JSON.parse(payload);

      if (commonUtils.isNumber(parsedPayload.SleepTime))
      {
        sleepTime = +parsedPayload.SleepTime * 1000;
      }

      if (parsedPayload.ForcedError !== undefined)
      {
        forcedError = parsedPayload.ForcedError;
      }
    }
    catch (parseError)
    {
      console.error('Did not receive a valid JSON payload: ' + payload);
    }

    // Load customer state
    customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    requestUtils.requireParameter('CurrentRule_functionOutputKey', customerState.CurrentRule_functionOutputKey);

    // Mark this integration as RUNNING
    var toUpdate = [ 'IntegrationStatus' ];
    customerState.IntegrationStatus = 'RUN';
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

    // Log that we have started
    inferenceUtils.logIntegrationRun(contactId, customerState);

    // Usually this is where you would do some work, call an external webservice
    // we will simply echo back the payload into customerState[customerState.CurrentRule_functionOutputKey]
    var processedResponse = payload;

    console.log(`Sleeping for: ${sleepTime} milliseconds`);
    await commonUtils.sleep(sleepTime);

    if (forcedError !== undefined)
    {
      console.error('Triggering a forced error');
      throw new Error(forcedError);
    }

    // Update state and mark this as complete writing the result into the requested state key
    inferenceUtils.updateState(customerState, stateToSave, customerState.CurrentRule_functionOutputKey, processedResponse);
    inferenceUtils.updateState(customerState, stateToSave, 'IntegrationStatus', 'DONE');
    inferenceUtils.updateState(customerState, stateToSave, 'IntegrationErrorCause', undefined);
    inferenceUtils.updateState(customerState, stateToSave, 'IntegrationEnd', commonUtils.nowUTCMillis());
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
    inferenceUtils.logIntegrationEnd(contactId, customerState, 'DONE', undefined);
  }
  catch (error)
  {
    // Update the failure state if possible
    if (customerState !== undefined && contactId !== undefined)
    {
      inferenceUtils.updateState(customerState, stateToSave, 'IntegrationStatus', 'ERROR');
      inferenceUtils.updateState(customerState, stateToSave, 'IntegrationErrorCause', error.message);
      inferenceUtils.updateState(customerState, stateToSave, 'IntegrationEnd', commonUtils.nowUTCMillis());
      inferenceUtils.updateState(customerState, stateToSave, customerState.CurrentRule_functionOutputKey, undefined);
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
      inferenceUtils.logIntegrationEnd(contactId, customerState, 'ERROR', error);
    }
    // Log the failure but skip state recording due to missing contact id
    else
    {
      console.error('Skipping recording failure as no state or contact id is available', error);
      throw error;
    }
  }
};
