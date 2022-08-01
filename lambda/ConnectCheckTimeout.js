var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

var moment = require('moment');

/**
 * Checks for time out in an integration lamnda call
 * returning the customer state and potentially updating the
 * integration result to TIMEOUT
 */
exports.handler = async(event, context) =>
{
  try
  {
    var contactId = event.Details.ContactData.InitialContactId;

    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Fetch all config items and load them into the top level of the customer state
    await configUtils.checkLastChange(process.env.CONFIG_TABLE);
    var configItems = await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    var configKeys = Object.keys(configItems);

    configKeys.forEach(key => {
      customerState[key] = configItems[key];
    });

    requestUtils.requireParameter('IntegrationStart', customerState.IntegrationStart);
    requestUtils.requireParameter('CurrentRule_functionTimeout', customerState.CurrentRule_functionTimeout);

    var timeout = moment(customerState.IntegrationStart).add(+customerState.CurrentRule_functionTimeout, 'seconds');

    var now = moment();

    if (now.isAfter(timeout))
    {
      var timeoutSeconds = now.diff(timeout, 'seconds');
      console.log(`[ERROR] integration timeout by ${timeoutSeconds} detected`);
      customerState.IntegrationStatus = 'TIMEOUT';
      customerState.IntegrationErrorCause = 'The request timed out';
      customerState.IntegrationEnd = moment();
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, [ 'IntegrationStatus', 'IntegrationEnd', 'IntegrationErrorCause' ]);
      return requestUtils.buildCustomerStateResponse(customerState);
    }

    // Now wait for up to 2 seconds for a result
    var endTime = moment(now).add(2, 'seconds');

    while ((customerState.IntegrationStatus === 'START' || customerState.IntegrationStatus === 'RUN') && moment().isBefore(endTime))
    {
      customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
    }

    console.log(`[TIMING] function: ${customerState.CurrentRule_functionName} got status: ${customerState.IntegrationStatus} in: ${moment().diff(moment(customerState.IntegrationStart))} millis`);

    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.log('[ERROR] failed to check for integration timeout', error);
    throw error;
  }
};

