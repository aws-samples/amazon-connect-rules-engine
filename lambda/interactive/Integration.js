// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Interactive rule component definition exposing the following
 * lifecycle methods:
 *
 * execute() called on first invocation (required)
 * input() called after input on provided (optional)
 * confirm() called after confirmation is provided (optional)
 *
 * The context parameter contains:
 *
 *  - requestMessage: the current request message
 *  - currentRuleSet: the current rule set
 *  - currentRule: the current rule
 *  - customerState: the current customer state
 *  - stateToSave: A set containing the state fields to persist
 */

const inferenceUtils = require('../utils/InferenceUtils');
const commonUtils = require('../utils/CommonUtils');
const lambdaUtils = require('../utils/LambdaUtils');
const dynamoUtils = require('../utils/DynamoUtils');
const moment = require('moment');

/**
 * Executes Integration function, simulating the async execution by ConnectIntegrationStart
 */
module.exports.execute = async (context) =>
{
  try
  {
    var functionArn = context.customerState.CurrentRule_functionArn;
    var functionName = context.customerState.CurrentRule_functionName;
    var functionPayload = context.customerState.CurrentRule_functionPayload;
    var functionOutputKey = context.customerState.CurrentRule_functionOutputKey;
    var functionTimeout = context.customerState.CurrentRule_functionTimeout;

    if (functionArn === undefined ||
        functionName === undefined ||
        functionPayload === undefined ||
        functionOutputKey === undefined ||
        functionTimeout === undefined)
    {
      throw new Error('Integration.execute() missing required config');
    }

    var contactId = context.requestMessage.contactId;

    functionTimeout = +functionTimeout;
    console.info('Found function timeout: ' + functionTimeout);

    // Update state to indicate we are starting
    var startTime = moment.utc();
    inferenceUtils.updateStateContext(context, 'IntegrationStatus', 'START');
    inferenceUtils.updateStateContext(context, 'IntegrationStart', commonUtils.nowUTCMillis());
    inferenceUtils.updateStateContext(context, 'IntegrationEnd', undefined);

    // Check point state before calling the integration function as it needs to load state from Dynamo
    console.info('Saving state');
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, context.customerState, Array.from(context.stateToSave));
    context.stateToSave.clear();
    console.info('State saved');

    var payload = {
      ContactId: contactId,
      OriginalRequest: '',
      Payload: functionPayload
    };

    await lambdaUtils.invokeAsync(functionArn, payload);

    // Now wait for up to timeout seconds for a result
    var endTime = moment(startTime).add(functionTimeout, 'seconds');
    context.customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    while ((context.customerState.IntegrationStatus === 'START' || context.customerState.IntegrationStatus === 'RUN') && moment().isBefore(endTime))
    {
      context.customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
      await commonUtils.sleep(100);
    }

    // If we get here with START or RUN it is a timeout
    if (context.customerState.IntegrationStatus === 'START' || context.customerState.IntegrationStatus === 'RUN')
    {
      console.error('Time out detected, updating IntegrationStatus to TIMEOUT');
      inferenceUtils.updateStateContext(context, 'IntegrationStatus', 'TIMEOUT');
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, context.customerState, Array.from(context.stateToSave));
      context.stateToSave.clear();
    }

    var result = {
      contactId: contactId,
      inputRequired: false,
      message: `Function: ${functionName} IntegrationStatus: ${context.customerState.IntegrationStatus}`,
      integrationStatus: context.customerState.IntegrationStatus,
      integrationErrorCause: context.customerState.IntegrationErrorCause,
      ruleSet: context.currentRuleSet.name,
      rule: context.currentRule.name,
      ruleType: context.currentRule.type
    };

    if (context.customerState.IntegrationErrorCause !== undefined)
    {
      result.message += `\nCause: ${context.customerState.IntegrationErrorCause}`;
    }

    console.info('Made response: ' + JSON.stringify(result, null, 2));

    return result;
  }
  catch (error)
  {
    console.error('Integration.execute() failed to execute: ' + error.message);
    throw error;
  }
};

/**
 * Executes Integration input
 */
module.exports.input = async (context) =>
{
  console.error('Integration.input() is not implemented');
  throw new Error('Integration.input() is not implemented');
};

/**
 * Executes Integration confirm
 */
module.exports.confirm = async (context) =>
{
  console.error('Integration.confirm() is not implemented');
  throw new Error('Integration.confirm() is not implemented');
};
