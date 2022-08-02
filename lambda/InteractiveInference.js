// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');
var rulesEngine = require('./utils/RulesEngine.js');
var lexUtils = require('./utils/LexUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');
var inferenceUtils = require('./utils/InferenceUtils.js');

var distributionInteractive = require('./interactive/Distribution.js');
var dtmfMenuInteractive = require('./interactive/DTMFMenu.js');
var dtmfInputInteractive = require('./interactive/DTMFInput.js');
var externalNumberInteractive = require('./interactive/ExternalNumber.js');
var integationInteractive = require('./interactive/Integration.js');
var messageInteractive = require('./interactive/Message.js');
var metricInteractive = require('./interactive/Metric.js');
var nluMenuInteractive = require('./interactive/NLUMenu.js');
var queueInteractive = require('./interactive/Queue.js');
var ruleSetInteractive = require('./interactive/RuleSet.js');
var smsMessageInteractive = require('./interactive/SMSMessage.js');
var setAttributesInteractive = require('./interactive/SetAttributes.js');
var terminateInteractive = require('./interactive/Terminate.js');
var updateStatesInteractive = require('./interactive/UpdateStates.js');

var moment = require('moment-timezone');

const { v4: uuidv4 } = require('uuid');

var LRU = require("lru-cache");

/**
 * 5 minute LRU cache for API keys
 */
var apiKeyCacheOptions = { max: 100, ttl: 1000 * 60 * 5 };
var apiKeyCache = new LRU(apiKeyCacheOptions);

/**
 * Provided interactive inference services
 */
exports.handler = async(event) =>
{
  try
  {
    requestUtils.checkOrigin(event);

    var apiKey = event.requestContext.identity.apiKey;

    var user = apiKeyCache.get(apiKey);

    if (user === undefined)
    {
      user = await requestUtils.verifyAPIKey(event);
      apiKeyCache.set(apiKey, user);
    }
    else
    {
      console.info('Used cached API Key');
    }

    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    // Verify last change timestamp
    if (!await configUtils.checkLastChange(process.env.CONFIG_TABLE))
    {
      inferenceUtils.clearCache();
    }

    // Force a reload of config if required
    await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    // Populate the inference utils cache
    await inferenceUtils.cacheRuleSets(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    // Parse the request
    var requestMessage = JSON.parse(event.body);

    logRequest(requestMessage);

    // Inference the request
    var inferenceResponse = await inference(requestMessage);

    return requestUtils.buildSuccessfulResponse(inferenceResponse);
  }
  catch (error)
  {
    console.error('Failed to interactively inference', error);
    return requestUtils.buildFailureResponse(500, {
      message: 'Failed to inference: ' + error.message
    });
  }
};

/**
 * Steps the system inferencing based on the input request message
 */
async function inference(requestMessage)
{
  try
  {
    // A list of state keys to update
    var stateToSave = new Set();

    var eventType = requestMessage.eventType;

    var response = undefined;

    switch(eventType)
    {
      case 'NEW_INTERACTION':
      {
        var customerState = {};
        response = await handleNewInteraction(requestMessage, customerState, stateToSave);
        break;
      }
      case 'NEXT_RULE':
      {
        var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, requestMessage.contactId);
        response = await handleNextRule(requestMessage, customerState, stateToSave);
        break;
      }
      case 'INPUT':
      {
        var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, requestMessage.contactId);

        // Input currently has 2 phases, input and confirm
        if (customerState.CurrentRule_phase === 'input')
        {
          response = await handleInput(requestMessage, customerState, stateToSave);
        }
        else if (customerState.CurrentRule_phase === 'confirm')
        {
          response = await handleConfirm(requestMessage, customerState, stateToSave);
        }
        else
        {
          throw new Error('Unhandled input phase: ' + customerState.CurrentRule_phase);
        }
        break;
      }
      case 'HANGUP':
      {
        var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, requestMessage.contactId);
        response = await handleHangup(requestMessage, customerState, stateToSave);
        break;
      }
      default:
      {
        throw new Error('Unhandled event type: ' + eventType);
      }
    }

    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, requestMessage.contactId, customerState, Array.from(stateToSave));
    stateToSave.clear();

    // Reload state from DDB
    var loadedState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, requestMessage.contactId);
    response.state = loadedState;

    logResponse(response);

    return response;
  }
  catch (error)
  {
    throw error;
  }
}

/**
 * Logs the request redacting inputAudio if set
 */
function logRequest(request)
{
  var copy = JSON.parse(JSON.stringify(request));
  console.info(`Received request: ${JSON.stringify(copy, null, 2)}`);
}

/**
 * Logs the response redacting audio if set
 */
function logResponse(response)
{
  var copy = JSON.parse(JSON.stringify(response));
  copy.state = undefined;

  if (response.audio !== undefined)
  {
    copy.audio = 'Redacted';
  }

  console.info(`Sending response: ${JSON.stringify(copy, null, 2)}`);
}

/**
 * Add current rule set and current rule ids to the response
 */
function enrichResponse(context, response)
{
  response.ruleSetId = context.currentRuleSet.ruleSetId;
  response.ruleId = context.currentRule.ruleId;
  response.folder = context.currentRuleSet.folder;
}

/**
 * Handles a new interaction message which should vend a new contact id
 * and set up the customer state and identify the starting rule set
 */
async function handleNewInteraction(requestMessage, customerState, stateToSave)
{
  try
  {
    requestMessage.contactId = 'interactive-' + uuidv4();

    // Populate system attributes
    await inferenceUtils.initialiseState(process.env.CONFIG_TABLE,
      requestMessage.contactId,
      requestMessage.endPoint,
      requestMessage.interactionDateTime,
      requestMessage.contactAttributes,
      customerState,
      stateToSave);

    // Capture the customer's phone number
    inferenceUtils.storeCustomerPhone(requestMessage.contactId, requestMessage.customerPhoneNumber, customerState, stateToSave);

    // Look up the rule set for the requested entry point
    var currentRuleSet = inferenceUtils.getRuleSetByEndPoint(requestMessage.endPoint);

    if (currentRuleSet === undefined)
    {
      throw new Error('Failed to rule set for end point: ' + requestMessage.endPoint);
    }

    // Save the current rule set name
    inferenceUtils.updateState(customerState, stateToSave, 'CurrentRuleSet', currentRuleSet.name);
    inferenceUtils.updateState(customerState, stateToSave, 'RuleSetStart', moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'));

    // Log rule set start
    inferenceUtils.logRuleSetStart(requestMessage.contactId, customerState, currentRuleSet.name, null);

    // Build the context
    var context = {
      contactId: requestMessage.contactId,
      requestMessage: requestMessage,
      currentRuleSet: currentRuleSet,
      customerState: customerState,
      stateToSave: stateToSave
    };

    // Step the simulation
    return await stepSimulation(context);
  }
  catch (error)
  {
    console.error('Failed to handle new call request', error);
    throw error;
  }
}

/**
 * Handles the next rule
 */
async function handleNextRule(requestMessage, customerState, stateToSave)
{
  try
  {
    // Move to the next rule set
    if (customerState.NextRuleSet !== undefined)
    {
      inferenceUtils.logRuleEnd(requestMessage.contactId, customerState);
      inferenceUtils.logRuleSetEnd(requestMessage.contactId, customerState, customerState.CurrentRuleSet, customerState.NextRuleSet);

      var previous = customerState.CurrentRuleSet;

      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRuleSet', customerState.NextRuleSet);
      inferenceUtils.updateState(customerState, stateToSave, 'RuleSetStart', moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'));
      inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', undefined);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule', undefined);

      inferenceUtils.logRuleSetStart(requestMessage.contactId, customerState, customerState.CurrentRuleSet, previous);
    }

    var currentRuleSet = inferenceUtils.getRuleSetByName(requestMessage.contactId, customerState.CurrentRuleSet);

    // Build the context
    var context = {
      requestMessage: requestMessage,
      currentRuleSet: currentRuleSet,
      customerState: customerState,
      stateToSave: stateToSave
    };

    // Step the simulation
    return await stepSimulation(context);
  }
  catch (error)
  {
    console.error('Failed to handle new call request', error);
    throw error;
  }
}

/**
 * Handles executing the next rule
 */
async function handleExecute(context)
{
  try
  {
    var response = {};

    switch (context.currentRule.type)
    {
      case 'Distribution':
      {
        response = await distributionInteractive.execute(context);
        break;
      }
      case 'DTMFMenu':
      {
        response = await dtmfMenuInteractive.execute(context);
        break;
      }
      case 'DTMFInput':
      {
        response = await dtmfInputInteractive.execute(context);
        break;
      }
      case 'ExternalNumber':
      {
        response = await externalNumberInteractive.execute(context);
        break;
      }
      case 'Integration':
      {
        response = await integationInteractive.execute(context);
        break;
      }
      case 'Message':
      {
        response = await messageInteractive.execute(context);
        break;
      }
      case 'Metric':
      {
        response = await metricInteractive.execute(context);
        break;
      }
      case 'NLUMenu':
      {
        response = await nluMenuInteractive.execute(context);
        break;
      }
      case 'Queue':
      {
        response = await queueInteractive.execute(context);
        break;
      }
      case 'RuleSet':
      {
        response = await ruleSetInteractive.execute(context);
        break;
      }
      case 'SMSMessage':
      {
        response = await smsMessageInteractive.execute(context);
        break;
      }
      case 'SetAttributes':
      {
        response = await setAttributesInteractive.execute(context);
        break;
      }
      case 'UpdateStates':
      {
        response = await updateStatesInteractive.execute(context);
        break;
      }
      case 'Terminate':
      {
        response = await terminateInteractive.execute(context);
        break;
      }
      default:
      {
        throw new Error('handleExecute() Unhandled rule type: ' + context.currentRule.type);
      }
    }

    enrichResponse(context, response);
    return response;
  }
  catch (error)
  {
    console.error(`handleExecute() Failed to execute rule: ${context.currentRule.type} due to: ${error.message}`);
    throw error;
  }
}

/**
 * Handles input
 */
async function handleInput(requestMessage, customerState, stateToSave)
{
  try
  {
    var currentRuleSet = inferenceUtils.getRuleSetByName(requestMessage.contactId, customerState.CurrentRuleSet);
    var currentRule = currentRuleSet.rules.find(rule => rule.name == customerState.CurrentRule);

    if (currentRule === undefined)
    {
      throw new Error('handleInput() Failed to find rule: ' + customerState.CurrentRule);
    }

    // Build the context
    var context = {
      requestMessage: requestMessage,
      currentRuleSet: currentRuleSet,
      currentRule: currentRule,
      customerState: customerState,
      stateToSave: stateToSave
    };

    var response = {};

    switch (currentRule.type)
    {
      case 'DTMFInput':
      {
        response = await dtmfInputInteractive.input(context);
        break;
      }
      case 'DTMFMenu':
      {
        response = await dtmfMenuInteractive.input(context);
        break;
      }
      case 'NLUMenu':
      {
        response = await nluMenuInteractive.input(context);
        break;
      }
      default:
      {
        throw new Error('handleInput() missing handler for input on rule: ' + currentRule.type);
      }
    }

    enrichResponse(context, response);
    return response;
  }
  catch (error)
  {
    console.error('handleInput() failed to handle input', error);
    throw error;
  }
}

/**
 * Handles confirmation
 */
async function handleConfirm(requestMessage, customerState, stateToSave)
{
  try
  {
    var currentRuleSet = inferenceUtils.getRuleSetByName(requestMessage.contactId, customerState.CurrentRuleSet);
    var currentRule = currentRuleSet.rules.find(rule => rule.name == customerState.CurrentRule);

    if (currentRule === undefined)
    {
      throw new Error('handleConfirm() Failed to find rule: ' + customerState.CurrentRule);
    }

    // Build the context
    var context = {
      requestMessage: requestMessage,
      currentRuleSet: currentRuleSet,
      currentRule: currentRule,
      customerState: customerState,
      stateToSave: stateToSave
    };

    var response = {};

    switch (currentRule.type)
    {
      case 'DTMFInput':
      {
        response = await dtmfInputInteractive.confirm(context);
        break;
      }
      case 'NLUMenu':
      {
        response = await nluMenuInteractive.confirm(context);
        break;
      }
      default:
      {
        throw new Error('handleConfirm() missing handler for confirm on rule: ' + currentRule.type);
      }
    }

    enrichResponse(context, response);
    return response;
  }
  catch (error)
  {
    console.error('handleConfirm() failed to handle confirm for: ' + currentRule.type, error);
    throw error;
  }
}

/**
 * Handles a hangup
 */
async function handleHangup(requestMessage, customerState, stateToSave)
{
  try
  {
    var response = {
      contactId: contactId,
      state: 'DISCONNECTED'
    };

    enrichResponse(context, response);
    return response;
  }
  catch (error)
  {
    console.error('handleHangup() failed to hang up', error);
    throw error;
  }

}

/**
 * Steps the simulation which identifies if we have a ruleset and rule
 * and works out what the next step in the process for that component is
 */
async function stepSimulation(context)
{
  try
  {
    console.info(`stepSimulation() inferencing ruleset: ${context.currentRuleSet.name}`);

    // Load up cached config
    var contactFlows = await configUtils.getContactFlows(process.env.CONFIG_TABLE);
    var prompts = await configUtils.getPrompts(process.env.CONFIG_TABLE);
    var lambdaFunctions = await configUtils.getLambdaFunctions(process.env.CONFIG_TABLE);
    var queues = await configUtils.getQueues(process.env.CONFIG_TABLE);
    var lexBots = await configUtils.getLexBots(process.env.CONFIG_TABLE);

    // Compute the current rule
    var startIndex = inferenceUtils.getNextRuleIndex(context.requestMessage.contactId, context.currentRuleSet, context.customerState, context.stateToSave);

    var currentRule = undefined;

    // If we get a -1 here we should pop the return stack
    // and call ourselved recursively
    if (startIndex === -1)
    {
      console.info('Reached the end of a rule set with a non-empty ReturnStack, resetting ruleset and rule');
      var returnItem = inferenceUtils.popReturnStack(context.customerState, context.stateToSave);

      inferenceUtils.updateStateContext(context, 'CurrentRuleSet', returnItem.ruleSetName);
      inferenceUtils.updateStateContext(context, 'CurrentRule', returnItem.ruleName);

      context.currentRuleSet = inferenceUtils.getRuleSetByName(context.requestMessage.contactId, returnItem.ruleSetName);
      context.currentRule = inferenceUtils.getRuleByName(context.requestMessage.contactId, returnItem.ruleSetName, returnItem.ruleName);

      return await stepSimulation(context);
    }
    else
    {
      console.info(`stepSimulation() start index ruleset: ${startIndex}`);

      // Fetch the next activated rule
      var currentRule = await rulesEngine.getNextActivatedRule(
        process.env.STAGE, process.env.SERVICE,
        process.env.REGION, process.env.ACCOUNT_NUMBER,
        context.requestMessage.contactId, context.currentRuleSet.rules,
        startIndex, context.customerState, queues, prompts,
        contactFlows, lambdaFunctions, lexBots);

      if (currentRule === undefined)
      {
        if (inferenceUtils.peekReturnStack(context.customerState) !== undefined)
        {
          var returnItem = inferenceUtils.popReturnStack(context.customerState, context.stateToSave);

          console.info(`Contact id: ${context.requestMessage.contactId} found return stack item after running out of rules: ${JSON.stringify(returnItem, null, 2)}`);

          inferenceUtils.updateStateContext(context, 'CurrentRuleSet', returnItem.ruleSetName);
          inferenceUtils.updateStateContext(context, 'CurrentRule', returnItem.ruleName);

          context.currentRuleSet = inferenceUtils.getRuleSetByName(context.requestMessage.contactId, returnItem.ruleSetName);
          context.currentRule = inferenceUtils.getRuleByName(context.requestMessage.contactId, returnItem.ruleSetName, returnItem.ruleName);

          return await stepSimulation(context);
        }
        else
        {
          throw new Error(`Contact id: ${context.requestMessage.contactId} failed to find next rule and had no return stack in ruleset: ${context.currentRuleSet.name} with startIndex: ${startIndex}`);
        }
      }

      // Store the current rule in the context
      context.currentRule = currentRule;

      console.info(`stepSimulation() inferencing rule: [${currentRule.name}] with type: [${currentRule.type}]`);

      inferenceUtils.logRuleEnd(context.requestMessage.contactId, context.customerState);

      // Export rule parameters into state
      inferenceUtils.exportRuleIntoState(context.requestMessage.contactId, currentRule, contactFlows, context.customerState, context.stateToSave);

      // Logs starting a rule
      inferenceUtils.logRuleStart(context.requestMessage.contactId, context.customerState);

      // Write out Dynamo state before going to the next rule in case the rule loads state again (Integration)
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, context.requestMessage.contactId, context.customerState, Array.from(context.stateToSave));
      context.stateToSave.clear();

      // Handle executing the next rule
      return await handleExecute(context);
    }
  }
  catch (error)
  {
    console.error('stepSimulation() failed to step simulation', error);
    throw error;
  }
}
