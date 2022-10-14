// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const configUtils = require('./utils/ConfigUtils');
const handlebarsUtils = require('./utils/HandlebarsUtils');
const keepWarmUtils = require('./utils/KeepWarmUtils');
const commonUtils = require('./utils/CommonUtils');
const inferenceUtils = require('./utils/InferenceUtils');
const snsUtils = require('./utils/SNSUtils');

const moment = require('moment-timezone');

/**
 * Lambda function that runs while the customer is in a queue
 * consumes configuration from the Queue rule and manages state
 * using customer state.
 * This function manages a state machine that allows for dynamic
 * behaviour in queue to be managed via configuration in Rules Engine.
 * Due to limitations of the Customer Queue contact flow type, it
 * is not possible to change contact flows so all logic must currently
 * be inline in the customer queue flow.
 */
exports.handler = async(event, context) =>
{
  var contactId = undefined;

  try
  {
    requestUtils.logRequest(event);

    // Reload config if required
    await configUtils.checkLastChange(process.env.CONFIG_TABLE);
    var configItems = await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    // Check for warm up message and bail out after config reload
    if (keepWarmUtils.isKeepWarmRequest(event))
    {
      return await keepWarmUtils.makeKeepWarmResponse(event, 0);
    }

    // TODO think about reloading queue behaviour config to support dynamic changes

    // Grab the contact id from the event
    contactId = event.Details.ContactData.InitialContactId;

    // State to save fields
    var stateToSave = new Set();

    // Load the current customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Clears the previous queue behaviour state
    module.exports.pruneOldBehaviourState(contactId, customerState, stateToSave);

    // Fetch the queue behaviours for this queue rule
    var queueBehaviours = module.exports.getQueueBehaviours(contactId, customerState);
    var queueBehaviourIndex = module.exports.getQueueBehaviourIndex(contactId, customerState);
    var behaviour = module.exports.getQueueBehaviour(contactId, queueBehaviourIndex, queueBehaviours);

    // Handle the behaviour
    var handleContext = await module.exports.handleQueueBehaviour(contactId, behaviour, configItems, customerState, stateToSave);

    // Increment the behaviour index if required
    if (handleContext.increment === true)
    {
      module.exports.incrementQueueBehaviourIndex(contactId, customerState, stateToSave);
    }

    console.info(`${contactId} new state before saving: ${JSON.stringify(customerState, null, 2)}`);

    // Save the state and return it
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
    var customerResponse = requestUtils.buildCustomerStateResponse(customerState);

    console.info(`${contactId} made customer response: ${JSON.stringify(customerResponse, null, 2)}`);

    return customerResponse;
  }
  catch (error)
  {
    console.error(`${contactId} Failed to handle customer queue behaviour`, error);
    throw error;
  }
};

/**
 * Fetches the queue behaviours from state
 */
module.exports.getQueueBehaviours = (contactId, customerState) =>
{
  var queueBehaviours = customerState.CurrentRule_queueBehaviours;

  if (queueBehaviours === undefined)
  {
    queueBehaviours = [];
  }

  console.info(`${contactId} found queue behaviours: ${JSON.stringify(queueBehaviours, null, 2)}`)

  return queueBehaviours;
};

/**
 * Fetches the queue behaviour index defaulting to 0
 */
module.exports.getQueueBehaviourIndex = (contactId, customerState, stateToSave) =>
{
  var queueBehaviourIndex = 0;

  if (customerState.CurrentRule_queueBehaviourIndex !== undefined)
  {
    queueBehaviourIndex = +customerState.CurrentRule_queueBehaviourIndex;
  }

  console.info(`${contactId} found queue behaviour index: ${queueBehaviourIndex}`);

  return queueBehaviourIndex;
};

/**
 * Increments the queue behaviour index for the next behaviour
 */
module.exports.incrementQueueBehaviourIndex = (contactId, customerState, stateToSave) =>
{
  var index = customerState.CurrentRule_queueBehaviourIndex;

  if (index === undefined)
  {
    index = 0;
  }
  else
  {
    index = +customerState.CurrentRule_queueBehaviourIndex;
  }

  index++;

  inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_queueBehaviourIndex', '' + index);
};

/**
 * Fetches a clone of the next queue behaviour
 */
module.exports.getQueueBehaviour = (contactId, index, behaviours) =>
{
  if (behaviours !== undefined &&
      behaviours.length > 0 &&
      index >= 0 &&
      index < behaviours.length)
  {
    return commonUtils.clone(behaviours[index]);
  }

  console.info(`${contactId} could not determine next queue behaviour for index: ${index}, returning undefined`);
  return undefined;
};

/**
 * Prunes old behaviour state between behaviour executions
 */
module.exports.pruneOldBehaviourState = (contactId, customerState, stateToSave) =>
{
  var stateKeys = Object.keys(customerState);

  stateKeys.forEach(key =>
  {
    if (key.startsWith('QueueBehaviour_'))
    {
      inferenceUtils.updateState(customerState, stateToSave, key, undefined);
    }
  });
};

/**
 * Handles the current queue behaviour
 */
module.exports.handleQueueBehaviour = async(contactId, behaviour, configItems, customerState, stateToSave) =>
{
  var handleContext =
  {
    increment: true
  };

  if (behaviour === undefined)
  {
    console.info(`${contactId} No behaviour was found`);
    inferenceUtils.updateState(customerState, stateToSave, 'QueueBehaviour_type', 'None');
    handleContext.increment = false;
    return handleContext;
  }

  module.exports.templateQueueBehaviour(contactId, behaviour, configItems, customerState, stateToSave);

  // Handle local execution
  switch (behaviour.type)
  {
    case 'GOTO':
    {
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_queueBehaviourIndex', behaviour.index);
      handleContext.increment = false;
      break;
    }
    case 'SMS':
    {
      // Sets the next index and calls ourself recursively
      try
      {
        await snsUtils.sendSMS(behaviour.phoneNumber, behaviour.message);
      }
      catch (error)
      {
        console.error('Failed to send SMS', error);
        throw error;
      }
      break;
    }
  }

  return handleContext;
};

/**
 * Template out each queue behvaiour parameter
 */
module.exports.templateQueueBehaviour = (contactId, behaviour, configItems, customerState, stateToSave) =>
{
  var keys = Object.keys(behaviour);

  keys.forEach(key =>
  {
    var value = behaviour[key];

    if (handlebarsUtils.isTemplate(value))
    {
      value = handlebarsUtils.template(value, customerState);
    }

    // Handle messages
    if (key === 'message')
    {
      if (value.trim() === '')
      {
        inferenceUtils.updateState(customerState, stateToSave, 'QueueBehaviour_messageType', 'none');
      }
      else if (commonUtils.isSSML(value))
      {
        inferenceUtils.updateState(customerState, stateToSave, 'QueueBehaviour_messageType', 'ssml');
      }
      else if (value.startsWith('prompt:'))
      {
        var prompts = configItems.prompts;

        if (prompts === undefined)
        {
          throw new Error('No prompts found in configuration!');
        }

        var promptLines = value.split(/\n/);
        var promptName = promptLines[0].trim().substring(7);
        var prompt = prompts.find((p) => p.Name === promptName);

        if (prompt !== undefined)
        {
          inferenceUtils.updateState(customerState, stateToSave, 'QueueBehaviour_messageType', 'prompt');
          inferenceUtils.updateState(customerState, stateToSave, 'QueueBehaviour_messagePromptArn', prompt.Arn);
        }
        else
        {
          console.error('Failed to locate prompt: ' + value);
          inferenceUtils.updateState(customerState, stateToSave, 'QueueBehaviour_messageType', 'none');
        }
      }
      else
      {
        inferenceUtils.updateState(customerState, stateToSave, 'QueueBehaviour_messageType', 'text');
      }

    }

    inferenceUtils.updateState(customerState, stateToSave, 'QueueBehaviour_' + key, value);
  });
}
