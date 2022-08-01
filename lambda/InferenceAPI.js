var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');
var rulesEngine = require('./utils/RulesEngine.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');
var inferenceUtils = require('./utils/InferenceUtils.js');
var keepWarmUtils = require('./utils/KeepWarmUtils.js');

var distributionInteractive = require('./interactive/Distribution.js');
var integationInteractive = require('./interactive/Integration.js');
var queueInteractive = require('./interactive/Queue.js');
var ruleSetInteractive = require('./interactive/RuleSet.js');
var setAttributesInteractive = require('./interactive/SetAttributes.js');
var smsMessageInteractive = require('./interactive/SMSMessage.js');
var terminateInteractive = require('./interactive/Terminate.js');
var updateStatesInteractive = require('./interactive/UpdateStates.js');

var moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');

/**
 * Provides inferernce via API and uses the interactive back end
 * uses AWS IAM access control for security
 */
exports.handler = async (requestMessage) =>
{
  var context = undefined;

  try
  {
    // console.info(`Got raw request: ` + JSON.stringify(requestMessage, null, 2));

    await checkSystemCache();

    // Check for warm up message and bail out after cache loads
    if (keepWarmUtils.isKeepWarmRequest(requestMessage))
    {
      return await keepWarmUtils.makeKeepWarmResponse(requestMessage, 0);
    }

    // Setup for inferencing
    context = await setupInferencing(requestMessage);

    // Inference until we run out of rules or hit a terminate
    await inference(context);

    // Return the state of the response
    var response = {
      Success: true,
      ContactId: context.contactId,
      State: cleanState(context.customerState),
      Warnings: context.warnings
    };

    logInfo(context, `Made success response: ` + JSON.stringify(response, null, 2));
    return response;
  }
  catch (error)
  {
    var response = {
      Success: false,
      ContactId: undefined,
      Cause: error.message
    };

    if (context !== undefined && context.contactId !== undefined)
    {
      response.ContactId = context.contactId;
    }

    logError(context, `Made error response: ` + JSON.stringify(response, null, 2), error);
    return response;
  }
};

/**
 * Checks the global change timestamp and forces a reload of cached config if required
 */
async function checkSystemCache()
{
  // Verify last change timestamp in the config system
  if (!await configUtils.checkLastChange(process.env.CONFIG_TABLE))
  {
    inferenceUtils.clearCache();
  }

  // Force a reload of config if required
  await configUtils.getConfigItems(process.env.CONFIG_TABLE);

  // Populate the cache if required
  await inferenceUtils.cacheRuleSets(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);
}

/**
 * Sets up for inferencing, vending a new contact id in the requestMessage and
 * inserting the starting state, returing the context to use for iterating rules
 */
async function setupInferencing(requestMessage)
{

  var context = undefined;

  try
  {
    requestMessage.contactId = 'api-' + uuidv4();

    var customerState = {};
    var stateToSave = new Set();

    // Populate system attributes
    await inferenceUtils.initialiseState(process.env.CONFIG_TABLE,
      requestMessage.contactId,
      requestMessage.EndPoint,
      moment(),
      requestMessage.ContactAttributes,
      customerState,
      stateToSave);

    customerState.System.ContactId = requestMessage.contactId;

    // Build the context
    context = {
      contactId: requestMessage.contactId,
      requestMessage: requestMessage,
      customerState: customerState,
      warnings: [],
      stateToSave: stateToSave
    };

    // Look up the rule set for the requested entry point
    var currentRuleSet = inferenceUtils.getRuleSetByEndPoint(requestMessage.EndPoint);

    if (currentRuleSet === undefined)
    {
      throwError(context, 'Failed to find rule set for end point: ' + requestMessage.EndPoint);
    }

    context.currentRuleSet = currentRuleSet;

    // Save the current rule set name
    inferenceUtils.updateStateContext(context, 'CurrentRuleSet', currentRuleSet.name);
    inferenceUtils.updateStateContext(context, 'RuleSetStart', moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'));

    // Persist the context as we finish
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, context.contactId, context.customerState, Array.from(context.stateToSave));
    context.stateToSave.clear();

    // Returns the newly created context
    return context;
  }
  catch (error)
  {
    logError(context, 'Failed to set up api inferencing', error);
    throw error;
  }
}

/**
 * Inferences until we run out of rules or hit a terminate rule
 */
async function inference(context)
{
  try
  {
    logInfo(context, 'Starting inferencing');

    // Keep iterating rules until we run out of rules or hit a terminate
    while (true)
    {
      var nextRule = await getNextRule(context);

      // If we have no next rule check the ruleset stack
      if (nextRule === undefined)
      {
        if (inferenceUtils.peekReturnStack(context.customerState) !== undefined)
        {
          var returnItem = inferenceUtils.popReturnStack(context.customerState, context.stateToSave);
          inferenceUtils.updateStateContext(context, 'CurrentRuleSet', returnItem.ruleSetName);
          inferenceUtils.updateStateContext(context, 'CurrentRule', returnItem.ruleName);
          context.currentRuleSet = inferenceUtils.getRuleSetByName(context.contactId, returnItem.ruleSetName);
          context.currentRule = inferenceUtils.getRuleByName(context.contactId, returnItem.ruleSetName, returnItem.ruleName);
          continue;
        }
        else
        {
          logInfo(context, 'Ran out of rules with no rule set stack');
          break;
        }
      }

      // Load up cached contact flows
      var contactFlows = await configUtils.getContactFlows(process.env.CONFIG_TABLE);

      // Export rule parameters into state
      inferenceUtils.exportRuleIntoState(context.contactId, nextRule,
        contactFlows, context.customerState, context.stateToSave);

      // Store the current rule
      context.currentRule = nextRule;

      // Handle the next rule
      await handleRule(context);

      // If we get a terminate rule then end the inference
      if (nextRule.type === 'Terminate')
      {
        logInfo(context, 'Found terminate rule, ending the inference');
        break;
      }

      // If we get a terminate rule then end the inference
      if (nextRule.type === 'Queue')
      {
        logInfo(context, 'Found queue rule, ending the inference');
        break;
      }

      // If we changed rule set update the context
      nextRuleSet(context);
    }

    // Save the state to Dynamo
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, context.contactId, context.customerState, Array.from(context.stateToSave));

    logInfo(context, 'Inferencing is complete');
  }
  catch (error)
  {
    logError(context, 'Failed to inference', error);
    throw error;
  }
}

function cleanState(state)
{
  var cloneState = JSON.parse(JSON.stringify(state));

  var stateKeys = Object.keys(cloneState);

  stateKeys.forEach(key =>
  {
    if (key.startsWith('CurrentRule_'))
    {
      cloneState[key] = undefined;
    }
  });

  return cloneState;
}

/**
 * Handles changing a rule set to: context.customerState.NextRuleSet
 * logs the events and sets up the context
 */
function nextRuleSet(context)
{
  if (context.customerState.NextRuleSet !== undefined)
  {
    logInfo(context, 'Changing rule set to: ' + context.customerState.NextRuleSet);
    var nextRuleSet = inferenceUtils.getRuleSetByName(context.contactId, context.customerState.NextRuleSet);
    inferenceUtils.updateState(context.customerState, context.stateToSave, 'CurrentRuleSet', nextRuleSet.name);
    inferenceUtils.updateState(context.customerState, context.stateToSave, 'RuleSetStart', moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'));
    inferenceUtils.updateState(context.customerState, context.stateToSave, 'NextRuleSet', undefined);
    inferenceUtils.updateState(context.customerState, context.stateToSave, 'CurrentRule', undefined);
    context.currentRuleSet = nextRuleSet;
    context.currentRule = undefined;
  }
}

/**
 * Logs an info with an optional contact id
 */
function logInfo(context, message)
{
  if (context !== undefined && context.contactId !== undefined)
  {
    console.info(`ContactId: ${context.contactId} ${message}`);
  }
  else
  {
    console.info(message);
  }
}

/**
 * Logs an error with an optional contact id
 */
function logError(context, message, cause = undefined)
{
  if (context !== undefined && context.contactId !== undefined)
  {
    console.error(`ContactId: ${context.contactId} ${message}`, cause);
  }
  else
  {
    console.error(message, cause);
  }
}

/**
 * Logs and throws an error
 */
function throwError(context, message, cause = undefined)
{
  logError(context, message, cause);
  if (context !== undefined && context.contactId !== undefined)
  {
    throw new Error(`ContactId: ${context.contactId} ${message}`, cause);
  }
  else
  {
    throw new Error(message, cause);
  }

}

/**
 * Handles executing the current rule
 */
async function handleRule(context)
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
      case 'Integration':
      {
        response = await integationInteractive.execute(context);
        break;
      }
      case 'Metric':
      {
        logInfo(context, `Skipping Metric rule: ${context.currentRule.name} in rule set: ${context.currentRuleSet.name}`);
        context.warnings.push(`Skipped Metric rule: ${context.currentRule.name} in rule set: ${context.currentRuleSet.name}`);
        break;
      }
      case 'Message':
      {
        logInfo(context, `Skipping Message rule: ${context.currentRule.name} in rule set: ${context.currentRuleSet.name}`);
        context.warnings.push(`Skipped Message rule: ${context.currentRule.name} in rule set: ${context.currentRuleSet.name}`);
        break;
      }
      case 'Queue':
      {
        response = await queueInteractive.execute(context);
        inferenceUtils.updateStateContext(context, 'queue', response.queue);
        break;
      }
      case 'RuleSet':
      {
        response = await ruleSetInteractive.execute(context);
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
        throw new Error('Unhandled rule type: ' + context.currentRule.type);
      }
    }

    return response;
  }
  catch (error)
  {
    throwError(context, `Failed to execute rule: ${context.currentRule.type} due to: ${error.message}`, error);
  }
}

/**
 * Finds the next rule returning it if there is one
 * or returning undefined if we reach the end of a rule set
 * for any reason
 */
async function getNextRule(context)
{
  try
  {
    logInfo(context, `Looking for the next rule in ruleset: ${context.currentRuleSet.name}`);

    // Load up cached config
    var contactFlows = await configUtils.getContactFlows(process.env.CONFIG_TABLE);
    var prompts = await configUtils.getPrompts(process.env.CONFIG_TABLE);
    var lambdaFunctions = await configUtils.getLambdaFunctions(process.env.CONFIG_TABLE);
    var queues = await configUtils.getQueues(process.env.CONFIG_TABLE);
    var lexBots = await configUtils.getLexBots(process.env.CONFIG_TABLE);

    // Compute the index of the next rule
    var startIndex = inferenceUtils.getNextRuleIndex(context.contactId, context.currentRuleSet, context.customerState, context.stateToSave);

    var currentRule = undefined;

    // If we get a -1 here it means we will need to pop the return stack in the calling code
    if (startIndex === -1)
    {
      logInfo(context, 'Found start index === -1 returning immediately');
      return undefined;
    }
    else
    {
      logInfo(context, `Start index for next rule: ${startIndex}`);

      // Fetch the next activated rule which may be undefined
      return await rulesEngine.getNextActivatedRule(
        process.env.STAGE, process.env.SERVICE,
        process.env.REGION, process.env.ACCOUNT_NUMBER,
        context.contactId, context.currentRuleSet.rules,
        startIndex, context.customerState, queues, prompts,
        contactFlows, lambdaFunctions, lexBots);
    }
  }
  catch (error)
  {
    logError(context, 'Failed to locate the next rule', error);
    throw error;
  }
}
