
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Creates a callback in DynamoDB
 */
exports.handler = async (event, context) =>
{
  try
  {
    requestUtils.logRequest(event);

    var contactId = event.Details.ContactData.InitialContactId;

    // Load customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    requestUtils.requireParameter('phoneNumber', event.Details.Parameters.phoneNumber);
    requestUtils.requireParameter('queueArn', customerState.CurrentRule_queueArn);

    var phoneNumber = event.Details.Parameters.phoneNumber;
    var queueArn = customerState.CurrentRule_queueArn;

    //check if callback exists
    var phoneNumberInAnyCallbackQueue = await dynamoUtils.phoneNumberInAnyCallbackQueue(process.env.CALLBACK_TABLE, phoneNumber);

    if (phoneNumberInAnyCallbackQueue)
    {
      customerState.CurrentRule_CreateCallbackStatus = 'EXISTING';
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CreateCallbackStatus']);
      return requestUtils.buildCustomerStateResponse(customerState);
    }
    else
    {
      await dynamoUtils.insertCallback(process.env.CALLBACK_TABLE, phoneNumber, queueArn);
      customerState.CurrentRule_CreateCallbackStatus = 'CREATED';
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CreateCallbackStatus']);
      return requestUtils.buildCustomerStateResponse(customerState);
    }
  }
  catch (error)
  {
    console.log('[ERROR] Failed to create callback', error);
    throw error;
  }
};
