// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');
var commonUtils = require('./utils/CommonUtils.js');
var operatingHoursUtils = require('./utils/OperatingHoursUtils.js');

var moment = require('moment-timezone');

/**
 * Gets the callback status for a given phone number and queueArn
 */
exports.handler = async (event, context) =>
{
  try
  {
    requestUtils.logRequest(event);

    var now = moment();

    var contactId = event.Details.ContactData.InitialContactId;
    requestUtils.requireParameter('ContactId', contactId);
    console.log('[INFO] Loading customer state');

    //load customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    //validate required inputs
    if (commonUtils.isEmptyString(customerState.OriginalCustomerNumber))
    {
      customerState.CurrentRule_CallbackStatus = 'UNAVAILABLE';
      customerState.CurrentRule_CallbackStatusReason = 'No original customer phone number';
      console.log(`[INFO] ConnectCallbackStatus: ${ customerState.CurrentRule_CallbackStatus} | ConnectCallbackStatusReason: ${ customerState.CurrentRule_CallbackStatusReason }`);
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CallbackStatus', 'CurrentRule_CallbackStatusReason']);
      return requestUtils.buildCustomerStateResponse(customerState);
    }

    //check if enabled
    if (customerState.CurrentRule_callbackEnabled !== 'true')
    {
      customerState.CurrentRule_CallbackStatus = 'UNAVAILABLE';
      customerState.CurrentRule_CallbackStatusReason = 'Callback disabled for this queue';
      console.log(`[INFO] ConnectCallbackStatus: ${ customerState.CurrentRule_CallbackStatus} | ConnectCallbackStatusReason: ${ customerState.CurrentRule_CallbackStatusReason }`);
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CallbackStatus', 'CurrentRule_CallbackStatusReason']);
      return requestUtils.buildCustomerStateResponse(customerState);
    }

    requestUtils.requireParameter('CurrentRule_queueName', customerState.CurrentRule_queueName);
    requestUtils.requireParameter('CurrentRule_queueArn', customerState.CurrentRule_queueArn);
    requestUtils.requireParameter('QueueMetrics_oldestContactInQueue', event.Details.Parameters.QueueMetrics_oldestContactInQueue);
    requestUtils.requireParameter('QueueMetrics_contactsInQueue', event.Details.Parameters.QueueMetrics_contactsInQueue);
    requestUtils.requireParameter('CurrentRule_oldestContactInQueueMinsThreshold', customerState.CurrentRule_oldestContactInQueueMinsThreshold);
    requestUtils.requireParameter('CurrentRule_numberOfContactsInQueueThreshold', customerState.CurrentRule_numberOfContactsInQueueThreshold);
    requestUtils.requireParameter('CurrentRule_queueClosesInMinsThreshold', customerState.CurrentRule_queueClosesInMinsThreshold);
    requestUtils.requireParameter('CurrentRule_callbackQueueMaxCountThreshold', customerState.CurrentRule_callbackQueueMaxCountThreshold);

    // See if the disbale callback flag has been overridden and disable callbacks for this
    // contact if it is set to 'true'
    var queueDisableCallbacksOverride = customerState.CurrentRule_queueDisableCallbacksOverride;

    if (queueDisableCallbacksOverride !== undefined &&
        queueDisableCallbacksOverride !== '' &&
        customerState[queueDisableCallbacksOverride] === 'true')
    {
      customerState.CurrentRule_CallbackStatus = 'UNAVAILABLE';
      customerState.CurrentRule_CallbackStatusReason = `Disable callback override flag: ${queueDisableCallbacksOverride} was true`;
      console.log(`[INFO] ConnectCallbackStatus: ${ customerState.CurrentRule_CallbackStatus} | ConnectCallbackStatusReason: ${ customerState.CurrentRule_CallbackStatusReason }`);
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CallbackStatus', 'CurrentRule_CallbackStatusReason']);
      return requestUtils.buildCustomerStateResponse(customerState);
    }

    // Look up queues and operating hours then find the operating hours for this queue
    var allQueues = await configUtils.getQueues(process.env.CONFIG_TABLE);
    var allOperatingHours = await configUtils.getOperatingHours(process.env.CONFIG_TABLE);

    var selectedQueue = allQueues.find(queue => queue.Name === customerState.CurrentRule_queueName);
    requestUtils.requireParameter('Queue: ' + customerState.CurrentRule_queueName, selectedQueue);

    var selectedOperatingHours = allOperatingHours.find(operatingHours => operatingHours.Id === selectedQueue.HoursOfOperationId);
    requestUtils.requireParameter('OperatingHours: ' + selectedQueue.HoursOfOperationId, selectedOperatingHours);

    var openStatus = operatingHoursUtils.evaluateSingleOperatingHours(selectedOperatingHours, now);

    console.log('[INFO] got open status: ' + JSON.stringify(openStatus, null, 2));

    //check if already in callback queue
    console.log(`[INFO] Calling Dynamo: phoneNumberInAnyCallbackQueue for phoneNumber: ${customerState.OriginalCustomerNumber}`);

    var phoneNumberInAnyCallbackQueue = await dynamoUtils.phoneNumberInAnyCallbackQueue(process.env.CALLBACK_TABLE, customerState.OriginalCustomerNumber);

    if (phoneNumberInAnyCallbackQueue) {
      customerState.CurrentRule_CallbackStatus = 'EXISTING';
      customerState.CurrentRule_CallbackStatusReason = 'Already exists in callback queue';
      console.log(`[INFO] ConnectCallbackStatus: ${ customerState.CurrentRule_CallbackStatus} | ConnectCallbackStatusReason: ${ customerState.CurrentRule_CallbackStatusReason }`);
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CallbackStatus', 'CurrentRule_CallbackStatusReason']);
      return requestUtils.buildCustomerStateResponse(customerState);
    }

    //check if callback queue count exceeds threshold
    console.log(`[INFO] Calling Dynamo: getCallbackCountByQueue for queueArn: ${customerState.CurrentRule_queueArn}`);

    var callbackQueueCount = await dynamoUtils.getCallbackCountByQueue(process.env.CALLBACK_TABLE, customerState.CurrentRule_queueArn);

    if (callbackQueueCount > customerState.CurrentRule_callbackQueueMaxCountThreshold) {
      customerState.CurrentRule_CallbackStatus = 'UNAVAILABLE';
      customerState.CurrentRule_CallbackStatusReason = `Callback queue count ${callbackQueueCount} exceeds threshold of ${customerState.CurrentRule_callbackQueueMaxCountThreshold}`;
      console.log(`[INFO] ConnectCallbackStatus: ${ customerState.CurrentRule_CallbackStatus} | ConnectCallbackStatusReason: ${ customerState.CurrentRule_CallbackStatusReason }`);
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CallbackStatus', 'CurrentRule_CallbackStatusReason']);
      return requestUtils.buildCustomerStateResponse(customerState);
    }

    //check if oldest contact in queue meets thresholds
    if (Math.ceil(event.Details.Parameters.QueueMetrics_oldestContactInQueue / 60) < customerState.CurrentRule_oldestContactInQueueMinsThreshold) {
      customerState.CurrentRule_CallbackStatus = 'UNAVAILABLE';
      customerState.CurrentRule_CallbackStatusReason = `Does not meet oldest contact in queue threshold. OldestContactInQueue: ${Math.ceil(event.Details.Parameters.QueueMetrics_oldestContactInQueue / 60)}. Threshold is : ${customerState.CurrentRule_oldestContactInQueueMinsThreshold}`;
      console.log(`[INFO] ConnectCallbackStatus: ${ customerState.CurrentRule_CallbackStatus} | ConnectCallbackStatusReason: ${ customerState.CurrentRule_CallbackStatusReason }`);
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CallbackStatus', 'CurrentRule_CallbackStatusReason']);
      return requestUtils.buildCustomerStateResponse(customerState);
    }

    //check if contacts in queue meets thresholds
    if (event.Details.Parameters.QueueMetrics_contactsInQueue < customerState.CurrentRule_numberOfContactsInQueueThreshold) {
      customerState.CurrentRule_CallbackStatus = 'UNAVAILABLE';
      customerState.CurrentRule_CallbackStatusReason = `Does not meet contacts in queue threshold. ContactsInQueue: ${event.Details.Parameters.QueueMetrics_contactsInQueue}. Threshold is: ${customerState.CurrentRule_numberOfContactsInQueueThreshold}`;
      console.log(`[INFO] ConnectCallbackStatus: ${ customerState.CurrentRule_CallbackStatus} | ConnectCallbackStatusReason: ${ customerState.CurrentRule_CallbackStatusReason }`);
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CallbackStatus', 'CurrentRule_CallbackStatusReason']);
      return requestUtils.buildCustomerStateResponse(customerState);
    }

    //check if mins to queue closing meets threshold
    if (openStatus.ClosesInMins < customerState.CurrentRule_queueClosesInMinsThreshold) {
      customerState.CurrentRule_CallbackStatus = 'UNAVAILABLE';
      customerState.CurrentRule_CallbackStatusReason = `Queue closes in ${openStatus.ClosesInMins} mins. Threshold is: ${customerState.CurrentRule_queueClosesInMinsThreshold}`;
      console.log(`[INFO] ConnectCallbackStatus: ${ customerState.CurrentRule_CallbackStatus} | ConnectCallbackStatusReason: ${ customerState.CurrentRule_CallbackStatusReason }`);
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CallbackStatus', 'CurrentRule_CallbackStatusReason']);
      return requestUtils.buildCustomerStateResponse(customerState);
    }

    //if we get here then we can offer callback
    customerState.CurrentRule_CallbackStatus = 'OFFER';
    console.log(`[INFO] ConnectCallbackStatus: ${ customerState.CurrentRule_CallbackStatus}`);
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, ['CurrentRule_CallbackStatus']);
    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error) {
    console.log('[ERROR] Failed to check callback status', error);
    throw error;
  }
};
