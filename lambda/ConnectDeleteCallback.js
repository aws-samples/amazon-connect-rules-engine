var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Deletes a callback from DynamoDB
 */
exports.handler = async (event, context) =>
{
  try
  {
    var contactId = event.Details.ContactData.InitialContactId;

    requestUtils.requireParameter('ContactId', contactId);

    //load customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    var phoneNumber = customerState.OriginalCustomerNumber;
    var queueArn = customerState.CurrentRule_queueArn;

    if (phoneNumber === undefined) {
      throw new Error('Missing required parameter: phoneNumber');
    }

    if (queueArn === undefined) {
      throw new Error('Missing required parameter: queueArn');
    }

    console.log(`[INFO] Deleting callback for ${phoneNumber} on queue ${queueArn}`);

    await dynamoUtils.deleteCallback(process.env.CALLBACK_TABLE, phoneNumber, queueArn);

    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error) {
    console.log('[ERROR] Failed to delete callback', error);
    throw error;
  }
};
