// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const configUtils = require('./utils/ConfigUtils');
const handlebarsUtils = require('./utils/HandlebarsUtils');
const keepWarmUtils = require('./utils/KeepWarmUtils');
const rulesEngine = require('./utils/RulesEngine');
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

    // TODO Compute human friendly wait times

    // TODO Load run time flags

    var queueBehaviours = module.exports.getQueueBehaviours(contactId, customerState);

    var queueBehaviourIndex = module.exports.getQueueBehaviourIndex(contactId, customerState);
    var behaviour = module.exports.getQueueBehaviour(contactId, queueBehaviourIndex, queueBehaviours);
    var behaviourActivated = module.exports.isBehaviourActivated(contactId, behaviour, customerState, stateToSave);

    while (behaviour !== undefined && !behaviourActivated)
    {
      module.exports.incrementQueueBehaviourIndex(contactId, customerState, stateToSave);
      queueBehaviourIndex = module.exports.getQueueBehaviourIndex(contactId, customerState);
      behaviour = module.exports.getQueueBehaviour(contactId, queueBehaviourIndex, queueBehaviours);
      behaviourActivated = module.exports.isBehaviourActivated(contactId, behaviour, customerState, stateToSave);
    }

    console.info(`${contactId} handling queue behaviour: ${JSON.stringify(behaviour, null, 2)}`);

    // Handle the behaviour
    var handleContext = await module.exports.handleQueueBehaviour(contactId, behaviour, behaviourActivated, configItems, customerState, stateToSave);

    // Increment the behaviour index if required
    if (handleContext.increment === true)
    {
      module.exports.incrementQueueBehaviourIndex(contactId, customerState, stateToSave);
    }

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

  return queueBehaviours;
};

/**
 * Fetches the queue behaviour index defaulting to 0
 */
module.exports.getQueueBehaviourIndex = (contactId, customerState) =>
{
  var queueBehaviourIndex = 0;

  if (customerState.CurrentRule_queueBehaviourIndex !== undefined)
  {
    queueBehaviourIndex = +customerState.CurrentRule_queueBehaviourIndex;
  }

  return queueBehaviourIndex;
};

/**
 * Fetches the queue behaviour return index defaulting getQueueBehaviourIndex() + 1
 *
 *
 */
module.exports.getQueueBehaviourReturnIndex = (contactId, customerState) =>
{
  var queueBehaviourReturnIndex = module.exports.getQueueBehaviourIndex(contactId, customerState) + 1;

  if (customerState.CurrentRule_queueBehaviourReturnIndex !== undefined)
  {
    queueBehaviourReturnIndex = +customerState.CurrentRule_queueBehaviourReturnIndex;
  }

  return queueBehaviourReturnIndex;
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
module.exports.handleQueueBehaviour = async (contactId, behaviour, behaviourActivated, configItems, customerState, stateToSave) =>
{
  var handleContext =
  {
    increment: true
  };

  if (behaviour === undefined || !behaviourActivated)
  {
    console.info(`${contactId} No active behaviour was found`);
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
      if (behaviour.returnFlag === true)
      {
        var nextIndex = module.exports.getQueueBehaviourIndex(contactId, customerState) + 1;
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_queueBehaviourReturnIndex', '' + nextIndex);
      }

      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_queueBehaviourIndex', '' + behaviour.index);
      handleContext.increment = false;
      break;
    }
    case 'Return':
    {
      var returnIndex = module.exports.getQueueBehaviourReturnIndex(contactId, customerState);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_queueBehaviourIndex', '' + returnIndex);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_queueBehaviourReturnIndex', undefined);

      console.info(`${contactId} used return index: ${returnIndex} to set queue behaviour index`);
      handleContext.increment = false;
      break;
    }
    case 'UpdateState':
    {
      if (customerState.QueueBehaviour_value === 'increment')
      {
        inferenceUtils.incrementStateValue(customerState, stateToSave, behaviour.outputKey);
      }
      else
      {
        // Use the processed value as these can be input as templates
        inferenceUtils.updateState(customerState, stateToSave, behaviour.outputKey, customerState.QueueBehaviour_value);
      }
      break;
    }
    case 'SMS':
    {
      // Sets the next index and calls ourself recursively
      try
      {
        await snsUtils.sendSMS(customerState.QueueBehaviour_phone, customerState.QueueBehaviour_message);
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
        var prompts = configItems.Prompts;

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

module.exports.isBehaviourActivated = (contactId, behaviour, customerState, stateToSave) =>
{
  if (behaviour === undefined)
  {
    return false;
  }

  if (behaviour.activation === 0 && behaviour.weights.length === 0)
  {
    console.info(`${contactId} behaviour is active due to no weights and zero activation: ${JSON.stringify(behaviour, null, 2)}`);
    return true;
  }

  var totalWeight = 0;
  var activation = +behaviour.activation;

  behaviour.weights.forEach(weight =>
  {
    if (!commonUtils.isNullOrUndefined(weight.value))
    {
      weight.value = weight.value.trim();
    }

    if (!commonUtils.isNullOrUndefined(weight.field))
    {
      weight.field = weight.field.trim();
    }

    // Fetch the raw value which is object path aware
    var rawValue = rulesEngine.getRawValue(weight, customerState);

    // Resolve weight values that are templates
    rulesEngine.resolveWeightValue(weight, customerState);

    if (rulesEngine.evaluateWeight(weight, rawValue))
    {
      totalWeight += +weight.weight;
      console.info(`${contactId} weight is activated: ${JSON.stringify(weight, null, 2)}`);
    }
    else
    {
      console.info(`${contactId} weight is not activated: ${JSON.stringify(weight, null, 2)}`);
    }
  });

  console.info(`${contactId} found total weight: ${totalWeight} with activation: ${activation}`);

  if (totalWeight >= activation)
  {
    console.info(`${contactId} behaviour is activated: ${JSON.stringify(behaviour, null, 2)}`);
    return true;
  }

  console.info(`${contactId} behaviour is not activated: ${JSON.stringify(behaviour, null, 2)}`);
  return false;
};
