var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var lambdaUtils = require('./utils/LambdaUtils.js');
var inferenceUtils = require('./utils/InferenceUtils.js');
var keepWarmUtils = require('./utils/KeepWarmUtils.js');

var moment = require('moment');

/**
 * Starts an integration request by updating state to indicate
 * starting then kicks off a Lambda function asynchronously.
 * State goes from START => RUN => (DONE or ERROR or TIMEOUT)
 */
exports.handler = async(event, context) =>
{

  var contactId = undefined;

  try
  {
    // Check for warm up message and bail out after cache loads
    if (keepWarmUtils.isKeepWarmRequest(event))
    {
      return await keepWarmUtils.makeKeepWarmResponse(event, 0);
    }

    requestUtils.requireParameter('InitialContactId', event.Details.ContactData.InitialContactId);

    contactId = event.Details.ContactData.InitialContactId;

    // Load customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Validate the function ARN
    requestUtils.requireParameter('CurrentRule_functionArn', customerState.CurrentRule_functionArn);
    var functionArn = customerState.CurrentRule_functionArn;

    var payload = customerState.CurrentRule_functionPayload;

    if (payload === undefined)
    {
      payload = '';
    }

    // Serialise the original request so it can be referenced later in invoked functions
    // via event.OriginalRequest
    var originalRequest = JSON.stringify(event);

    var startTime = moment.utc();

    // Update state to indicate we are starting
    var toUpdate = [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationStart' ];
    customerState.IntegrationStatus = 'START';
    customerState.IntegrationStart = startTime.format('YYYY-MM-DDTHH:mm:ss.SSSZ');
    customerState.IntegrationEnd = undefined;
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);

    var integrationRequest = {
      ContactId: contactId,
      Payload: payload,
      OriginalRequest: originalRequest
    };

    // Invoke the Lambda function passing the integration request
     await lambdaUtils.invokeAsync(functionArn, integrationRequest);

    // Now wait for up to 3 seconds for a result
    var endTime = moment(startTime).add(2, 'seconds');
    var loadedState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    while ((loadedState.IntegrationStatus === 'START' || loadedState.IntegrationStatus === 'RUN') && moment().isBefore(endTime))
    {
      loadedState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
      await inferenceUtils.sleep(100);
    }

    console.log(`[TIMING] function: ${customerState.CurrentRule_functionName} got status: ${loadedState.IntegrationStatus} in: ${moment().diff(startTime)} millis`);

    return requestUtils.buildCustomerStateResponse(loadedState);
  }
  catch (error)
  {
    // Update the failure state
    if (contactId !== undefined)
    {
      console.log('[ERROR] recording failure in state', error);
      customerState.IntegrationStatus = 'ERROR';
      customerState.IntegrationEnd = moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
      toUpdate = [ 'IntegrationStatus', 'IntegrationEnd' ];
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, toUpdate);
    }
    // Log the failure but skip state recording due to missing contact id
    else
    {
      console.log('[ERROR] Skipping recording failure as no ContactId available', error);
    }

    return {
      status: 'ERROR'
    };
  }
};

