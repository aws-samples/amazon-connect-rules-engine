var moment = require('moment');
var requestUtils = require('../utils/RequestUtils.js');
var dynamoUtils = require('../utils/DynamoUtils.js');
var inferenceUtils = require('../utils/InferenceUtils.js');

/**
 * Simplest integration lambda function that echos
 * the request payload into the output state field
 */
exports.handler = async(event, context, callback) =>
{

  var contactId = undefined;
  var customerState = undefined;

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

      if (inferenceUtils.isNumber(parsedPayload.SleepTime))
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

    console.info('Loaded customer state: ' + JSON.stringify(customerState, null, 2));

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

    console.log('Sleeping for: ' + sleepTime);

    if (forcedError !== undefined)
    {
      console.error('Triggering a forced error');
      throw new Error(forcedError);
    }

    await inferenceUtils.sleep(sleepTime);

    // Update state and mark this as complete writing the result into the requested state key
    customerState[customerState.CurrentRule_functionOutputKey] = processedResponse;
    customerState.IntegrationStatus = 'DONE';
    customerState.IntegrationErrorCause = undefined;
    customerState.IntegrationEnd = moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    toUpdate = [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationErrorCause', customerState.CurrentRule_functionOutputKey];
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

    // Log the done result
    inferenceUtils.logIntegrationEnd(contactId, customerState, 'DONE', undefined);
  }
  catch (error)
  {
    // Update the failure state if possible
    if (customerState !== undefined && contactId !== undefined)
    {
      customerState.IntegrationStatus = 'ERROR';
      customerState.IntegrationErrorCause = error.message;
      customerState.IntegrationEnd = moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      customerState[customerState.CurrentRule_functionOutputKey] = undefined;
      toUpdate = [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationErrorCause', customerState.CurrentRule_functionOutputKey ];
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

      // Load the error result
      inferenceUtils.logIntegrationEnd(contactId, customerState, 'ERROR', error);
    }
    // Log the failure but skip state recording due to missing contact id
    else
    {
      console.error('Skipping recording failure as no state or contact id is available', error);
    }
  }
};
