// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const connectUtils = require('./utils/ConnectUtils');
const rulesEngine = require('./utils/RulesEngine');
const lexUtils = require('./utils/LexUtils');
const configUtils = require('./utils/ConfigUtils');
const lambdaUtils = require('./utils/LambdaUtils');
const cloudWatchUtils = require('./utils/CloudWatchUtils');
const operatingHoursUtils = require('./utils/OperatingHoursUtils');
const keepWarmUtils = require('./utils/KeepWarmUtils');
const inferenceUtils = require('./utils/InferenceUtils');
const commonUtils = require('./utils/CommonUtils');

const moment = require('moment-timezone');
const weighted = require('weighted');

// Rule sets and config cached until the last change indicates a reload is required
var ruleSetsMap = undefined;
var inboundNumbersMap = undefined;
var endPointsMap = undefined;

/**
 * Connect rules inferencing Lambda function.
 * This function runs at the start of the main contact flow
 * and has several purposes:
 *
 * - Loads customer state from DDB
 * - Calculate system attributes if not set
 * - If customer data has not been loaded try and load it (customisation)
 * - If there is no current ruleset loaded, try and determine it from the dialled number
 * - If there is a current rule set, look for the next rule to activate
 * - If there is a NextRuleSet state set swap to it
 *
 * Once a rule set has been identified, look for the next rule to fire
 * which might have an offset starting rule.
 *
 * Prune out old rule state using the prefix CurrentRule_
 *
 * Finally merge in the current rule's config into the state and save it with the
 * updated fields and export user state.
 */
exports.handler = async(event, context) =>
{
  try
  {
    // Verify last change timestamp
    if (!await configUtils.checkLastChange(process.env.CONFIG_TABLE))
    {
      ruleSetsMap = undefined;
      inboundNumbersMap = undefined;
      endPointsMap = undefined;
    }

    // Load cached config items (reloading if required)
    var configItems = await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    // Load up the cached rule sets and end points if required
    await cacheRuleSetsAndEndPoints();

    // Check for warm up message and bail out after cache loads
    if (keepWarmUtils.isKeepWarmRequest(event))
    {
      return await keepWarmUtils.makeKeepWarmResponse(event, 0);
    }

    // A list of state keys to update
    var stateToSave = new Set();

    // Grab the contact id from the event
    var contactId = event.Details.ContactData.InitialContactId;

    console.info(`ContactId: ${contactId} inferencing with event: ${JSON.stringify(event, null, 2)}`);

    // Load the current customer state this will be empty on first approach
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Populate config keys into the top level of the customer state
    loadConfigIntoState(customerState, configItems);

    // Load system attributes if they are not already loaded
    await loadSystemAttributes(process.env.CONFIG_TABLE, event, contactId, customerState, stateToSave);

    // Store the incoming customer phone number in the state
    storeCustomerPhone(contactId, event, customerState, stateToSave);

    // TODO Load customer account data if desired here (or use integration)

    // Find the current rule set and clone it
    var currentRuleSet = getCurrentRuleSet(contactId, customerState, stateToSave);

    // Load up cached config
    var contactFlows = await configUtils.getContactFlows(process.env.CONFIG_TABLE);
    var prompts = await configUtils.getPrompts(process.env.CONFIG_TABLE);
    var lambdaFunctions = await configUtils.getLambdaFunctions(process.env.CONFIG_TABLE);
    var queues = await configUtils.getQueues(process.env.CONFIG_TABLE);
    var lexBots = await configUtils.getLexBots(process.env.CONFIG_TABLE);

    var processingState = {
      evaluateNextRule: true,
      ruleSetChanged: false,
      stateFlushed: false
    };

    while (processingState.evaluateNextRule)
    {
      if (processingState.stateFlushed)
      {
        customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);
        loadConfigIntoState(customerState, configItems);
      }

      var startIndex = getNextRuleIndex(contactId, currentRuleSet, customerState, stateToSave);

      // If startIndex -1 we have to pop the return stack
      if (startIndex === -1)
      {
        var returnItem = popReturnStack(customerState, stateToSave);
        console.info('Ran out of rules and successfully popped the return stack, returning to: ' + JSON.stringify(returnItem, null, 2));
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRuleSet', returnItem.ruleSetName);
        inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule', returnItem.ruleName);
        processingState.ruleSetChanged = true;
        processingState.evaluateNextRule = false;
      }
      else
      {
        // Fetch the next activated rule
        var nextRule = await rulesEngine.getNextActivatedRule(
          process.env.STAGE, process.env.SERVICE,
          process.env.REGION, process.env.ACCOUNT_NUMBER,
          contactId, currentRuleSet.rules,
          startIndex, customerState, queues, prompts,
          contactFlows, lambdaFunctions, lexBots);

        if (nextRule === undefined)
        {
          if (peekReturnStack(customerState) !== undefined)
          {
            var returnItem = popReturnStack(customerState, stateToSave);

            console.info('Found return stack item after running out of rules: ' + JSON.stringify(returnItem, null, 2));
            inferenceUtils.updateState(customerState, stateToSave, 'CurrentRuleSet', returnItem.ruleSetName);
            inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule', returnItem.ruleName);
            processingState.ruleSetChanged = true;
            processingState.evaluateNextRule = false;
          }
          else
          {
            throw new Error(`Contact id: ${contactId} failed to find next rule and had no return stack in ruleset: ${currentRuleSet.name} with startIndex: ${startIndex}`);
          }
        }

        if (nextRule !== undefined)
        {
          // Logs completion of a rule
          logRuleEnd(contactId, customerState);

          exportRuleIntoState(contactId, nextRule, contactFlows, customerState, stateToSave);

          // Logs the start of a new rule
          logRuleStart(contactId, customerState);

          if (nextRule.type === 'Queue')
          {
            var delta = computeAttributesDelta(event, contactId, customerState);

            if (delta.length > 200)
            {
              console.error(`ContactId: ${contactId} found: ${delta.length} contact attributes which exceeds the maximum: 200`);
              throw new Error(`ContactId: ${contactId} found: ${delta.length} contact attributes which exceeds the maximum: 200`);
            }
            else if (delta.length > 0)
            {
              console.info(`ContactId: ${contactId} queue rule exporting delta attributes: ${JSON.stringify(delta, null, 2)}`);

              for (var i = 0; i < delta.length; i++)
              {
                inferenceUtils.updateState(customerState, stateToSave, `CurrentRule_attributeKey${i}`, delta[i].key);
                inferenceUtils.updateState(customerState, stateToSave, `CurrentRule_attributeValue${i}`, '' + delta[i].value);
              }

              inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_attributeCount', '' + delta.length);
            }
            else
            {
              console.info(`ContactId: ${contactId} Found queue rule with no attribute delta`);
              inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_attributeCount', '0');
            }
          }

          // If this is a non-Connect rule type, handle it locally
          if (canProcessLocally(nextRule))
          {
            console.info(`Processing rule: [${nextRule.name}] with type: [${nextRule.type}] locally`);
            await processRuleLocally(processingState, contactId, nextRule, customerState, stateToSave);
          }
          else
          {
            // This rule requires a connect contact flow stop processing for now
            console.info(`Processing rule: [${nextRule.name}] with type: [${nextRule.type}] remotely using Connect`);
            processingState.evaluateNextRule = false;
          }
        }
      }

      // Save out the state changes
      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
      stateToSave.clear();

      // Force a refresh in case we wrote JSON to the customer state and want to parse it
      processingState.stateFlushed = true;

      // We detected a rule set change above from a RuleSet rule or a ReturnStack pop
      // so just call outselves recursively returning the recursive response
      if (processingState.ruleSetChanged)
      {
        console.info(`Rule set changed, calling ourselves recursively`);
        return await exports.handler(event, context);
      }
    }

    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.info('Failed to inference rules engine from connect', error);
    throw error;
  }
};

/**
 * Populate config items into state
 */
function loadConfigIntoState(customerState, configItems)
{
  var configKeys = Object.keys(configItems);
  configKeys.forEach(key => {
    customerState[key] = configItems[key];
  });
}

/**
 * Checks to see if a rule can be executed locally
 */
function canProcessLocally(nextRule)
{
  if (nextRule.type === 'RuleSet')
  {
    return true;
  }

  if (nextRule.type === 'UpdateStates')
  {
    return true;
  }

  if (nextRule.type === 'SetAttributes')
  {
    return true;
  }

  if (nextRule.type === 'TextInference')
  {
    return true;
  }

  if (nextRule.type === 'Metric')
  {
    return true;
  }

  if (nextRule.type === 'Distribution')
  {
    return true;
  }

  return false;
}

/**
 * Processes a rule locally and not via Connect for performance reasons
 */
async function processRuleLocally(processingState, contactId, nextRule, customerState, stateToSave)
{
  if (nextRule.type === 'RuleSet')
  {
    processingState.evaluateNextRule = false;

    inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', nextRule.params.ruleSetName);

    if (nextRule.params.returnHere === 'true')
    {
      pushReturnStack(customerState.CurrentRuleSet, customerState.CurrentRule, customerState, stateToSave);
    }

    // If we have a message to play to the customer,
    if (nextRule.params.message === undefined || nextRule.params.message === '')
    {
      console.info('Found rule set without message, continuing processing');
      processingState.ruleSetChanged = true;
    }
    else
    {
      console.info('Found rule set with a message, playing it with Connect');
      // Mark this as false so we exit to Connect gracefully
      processingState.ruleSetChanged = false;
    }

    return;
  }
  else if (nextRule.type === 'Metric')
  {
    await putMetric(nextRule);
    return;
  }
  else if (nextRule.type === 'UpdateStates')
  {
    for (var i = 0; i < nextRule.params.updateStates.length; i++)
    {
      var stateKey = nextRule.params.updateStates[i].key;
      var stateValue = nextRule.params.updateStates[i].value;

      if (stateValue === 'increment')
      {
        // Look in the customer state and try and safely increment
        var existingValue = customerState[stateKey];

        if (!commonUtils.isNumber(existingValue))
        {
          stateValue = '1';
        }
        else
        {
          stateValue = '' + (+existingValue + 1);
        }
      }

      inferenceUtils.updateState(customerState, stateToSave, stateKey, stateValue);
    }

    return;
  }
  else if (nextRule.type === 'SetAttributes')
  {
    console.info(`ContactId: ${contactId} SetAttributes before: ${JSON.stringify(customerState.ContactAttributes, null, 2)}`)
    nextRule.params.setAttributes.forEach(attribute =>
    {
      inferenceUtils.updateState(customerState, stateToSave, 'ContactAttributes.' + attribute.key, attribute.value);
    });
    console.info(`ContactId: ${contactId} SetAttributes after: ${JSON.stringify(customerState.ContactAttributes, null, 2)}`)
    return;
  }
  else if (nextRule.type === 'TextInference')
  {
    var nextRuleSet = await handleTextInference(contactId, customerState);

    if (nextRuleSet === undefined)
    {
      console.info(`ContactId: ${contactId} TextInference did not find a next rule set`)
    }
    else
    {
      processingState.evaluateNextRule = false;
      processingState.ruleSetChanged = true;
      inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', nextRuleSet);
      console.info(`ContactId: ${contactId} TextInference determined next rule set: ${nextRuleSet}`)
    }
    return;
  }
  else if (nextRule.type === 'Distribution')
  {
    var nextRuleSet = solveDistribution(customerState);
    processingState.evaluateNextRule = false;
    processingState.ruleSetChanged = true;
    inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', nextRuleSet);
    return;
  }

  throw new Error('Unhandled non-connect rule: ' + JSON.stringify(nextRule, null, 2));
}

/**
 * Write a custom CloudWatch metric, logging and continuing
 * on failure.
 */
async function putMetric(rule)
{
  try
  {
    var metricName = rule.params.metricName;
    var metricValue = rule.params.metricValue;

    if (metricValue === undefined)
    {
      console.info('Using default value for metric: 1')
      metricValue = 1;
    }

    await cloudWatchUtils.putMetricData(process.env.STAGE,
      process.env.CLOUDWATCH_NAMESPACE,
      metricName, metricValue);
  }
  catch (error)
  {
    // Log and eat any errors to prevent customer facing errors
    // due to unlikely CloudWatch PutMetricData throttling > 150/sec
    // https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_limits.html
    console.error('Failed to put custom metric', error);
  }
}

/**
 * Inference a lex bot with text input to determine if we should change rule
 * set immediately
 */
async function handleTextInference(contactId, customerState)
{
  try
  {
    var input = customerState.CurrentRule_input;

    if (commonUtils.isEmptyString(input))
    {
      console.info(`${contactId} got empty input not inferencing`);
      return undefined;
    }

    var lexBotName = customerState.CurrentRule_lexBotName;
    var lexBot = await lexUtils.findLexBotBySimpleName(lexBotName);
    var intentResponse = undefined;

    intentResponse = await lexUtils.recognizeText(
      lexBot.Id,
      lexBot.AliasId,
      lexBot.LocaleId,
      input,
      contactId);

    console.info(`${contactId} got lex inference response: ${JSON.stringify(intentResponse, null, 2)}`);

    var nextRuleSet = customerState['CurrentRule_intentRuleSet_' + intentResponse.intent];

    if (!commonUtils.isEmptyString(nextRuleSet))
    {
      var intentConfidence = 0.0;

      if (commonUtils.isNumber(customerState['CurrentRule_intentConfidence_' + intentResponse.intent]))
      {
        intentConfidence = +customerState['CurrentRule_intentConfidence_' + intentResponse.intent];
      }

      if (intentResponse.confidence >= intentConfidence)
      {
        console.info(`${contactId} reached required confidence: ${intentConfidence} with confidence: ${intentResponse.confidence} for intent: ${intentResponse.intent} routing to rule set: ${nextRuleSet}`)
        return nextRuleSet;
      }
      else
      {
        console.info(`${contactId} did not reach required confidence: ${intentConfidence} with confidence: ${intentResponse.confidence} for intent: ${intentResponse.intent} to route to: ${nextRuleSet}`)
      }
    }
    else
    {
      console.info(`${contactId} found no rule set mapping for intent: ${intentResponse.intent} falling through`);
    }

    return undefined;

  }
  catch (error)
  {
    console.error(`${contactId} got error while performing text inferencing, falling through`, error);
    return undefined;
  }
}

/**
 * Given a distribution rule config in customer state
 * with percentage weighted rule sets and a default rule set,
 * compute the next rule set using the probabiity as a weight
 */
function solveDistribution(customerState)
{
  var probabilities = [];
  var ruleSetNames = [];

  if (customerState.CurrentRule_optionCount === undefined)
  {
    throw new Error('Invalid Distribution configuration detected, missing: ' + customerState.CurrentRule_optionCount);
  }

  var optionCount = +customerState.CurrentRule_optionCount;

  var totalProbability = 0;

  for (var i = 0; i < optionCount; i++)
  {
    var option = customerState['CurrentRule_ruleSetName' + i];
    var percentage = customerState['CurrentRule_percentage' + i];

    if (option === undefined || percentage === undefined)
    {
      throw new Error('Invalid Distribution configuration detected for option: ' + i);
    }

    ruleSetNames.push(option);
    var probability = +percentage / 100.0;
    probabilities.push(probability);
    totalProbability += probability;
  }

  if (totalProbability > 1.0)
  {
    throw new Error('Invalid Distribution configuration detected, total probablity exceeds 100%');
  }

  // Add the default option since we are < 1.0 total probability
  if (totalProbability < 1.0)
  {
    var defaultRuleSetName = customerState.CurrentRule_defaultRuleSetName;

    if (defaultRuleSetName === undefined)
    {
      throw new Error('Invalid Distribution configuration detected, no default rule set name provided');
    }

    ruleSetNames.push(defaultRuleSetName);
    probabilities.push(1.0 - totalProbability);
  }

  console.info(`Looking up next rule set from:\n${ruleSetNames}\nUsing probabilities:\n${probabilities}`);

  // Find the next option using the probabiities
  var nextRuleSet = weighted.select(ruleSetNames, probabilities);

  console.info('Found next rule set name from Distribution: ' + nextRuleSet);

  return nextRuleSet;
}

/**
 * Load cached rule sets and end points, the cache is checked at the start of inferencing
 */
async function cacheRuleSetsAndEndPoints()
{
  if (ruleSetsMap !== undefined && inboundNumbersMap !== undefined && endPointsMap !== undefined)
  {
    return;
  }

  console.info('Reloading end points and rule sets into cache');

  // Load end points
  var endPoints = await dynamoUtils.getEndPoints(process.env.END_POINTS_TABLE);

  // Load rule sets
  var ruleSets = await dynamoUtils.getRuleSetsAndRules(
    process.env.RULE_SETS_TABLE,
    process.env.RULES_TABLE);

  // Filter out disabled end points
  endPoints = endPoints.filter(endPoint => endPoint.enabled === true);

  // Filter out disabled rule sets
  ruleSets = ruleSets.filter(ruleSet => ruleSet.enabled === true);

  // Filter out disabled rules
  ruleSets.forEach(ruleSet => {
    ruleSet.rules = ruleSet.rules.filter(rule => rule.enabled === true);
  });

  ruleSetsMap = new Map();
  inboundNumbersMap = new Map();
  endPointsMap = new Map;

  // Cache end points against inbound numbers
  endPoints.forEach(endPoint => {
    endPoint.inboundNumbers.forEach(inboundNumber => {
      inboundNumbersMap.set(inboundNumber, endPoint);
    });
  });

  // Cache rule sets again end point names
  ruleSets.forEach(ruleSet => {
    ruleSetsMap.set(ruleSet.name, ruleSet);
    ruleSet.endPoints.forEach(endPointName => {
      endPointsMap.set(endPointName, ruleSet);
    });
  })
}

/**
 * Computes attributes that are missing or changed from the
 * contact event Details.ContactData.Attributes and what is
 * is in customerState.ContactAttributes, state is the source of truth.
 */
function computeAttributesDelta(event, contactId, customerState)
{
  var contactAttributes = event.Details.ContactData.Attributes;

  if (contactAttributes === undefined)
  {
    contactAttributes = {};
  }

  var delta = [];

  var stateAttributes = customerState.ContactAttributes;

  if (stateAttributes === undefined)
  {
    stateAttributes = {};
  }

  Object.keys(stateAttributes).forEach(key =>
  {
    var stateValue = stateAttributes[key];
    var attributeValue = contactAttributes[key];

    if (stateValue !== attributeValue)
    {
      delta.push({
        key: key,
        value: stateValue
      });
    }

  });

  return delta;
}

/**
 * If there is no System customer state, compute one.
 * This calculates the operating hours, dialled number, call timestamps,
 * morning / afternoon flags and holiday status
 * Also clones the contact attributes passed in from Connect on first invocation
 * in case the contact was initiated with a base set of contact attributes.
 * If the contactEvent contact attributes contains: RulesEngineEndPoint this should be
 * resolved to an end point and a rule set
 */
async function loadSystemAttributes(configTable, contactEvent, contactId, customerState, stateToSave)
{
  try
  {
    if (customerState.System === undefined)
    {
      var timeZone = await configUtils.getCallCentreTimeZone(configTable);

      var operatingHoursState = await operatingHoursUtils.evaluateOperatingHours(configTable);

      var utcTime = moment().utc();
      var localTime = moment(utcTime).tz(timeZone);
      var localHour = localTime.hour();

      var dialledNumber = 'Unknown';

      if (contactEvent.Details &&
          contactEvent.Details.ContactData &&
          contactEvent.Details.ContactData.SystemEndpoint &&
          contactEvent.Details.ContactData.SystemEndpoint.Address)
      {
        dialledNumber = contactEvent.Details.ContactData.SystemEndpoint.Address;
      }

      var isHoliday = await operatingHoursUtils.isHoliday(configTable, utcTime);

      var systemState = {
        ContactId: contactId,
        Holiday: '' + isHoliday,
        OperatingHours: operatingHoursState,
        DialledNumber: dialledNumber,
        DateTimeUTC: utcTime.format(),
        DateTimeLocal: localTime.format(),
        TimeLocal: localTime.format('hh:mm A'),
        TimeOfDay: connectUtils.getTimeOfDay(localHour)
      };

      // Clone in contact attributes if present on first invocation
      if (contactEvent.Details !== undefined &&
          contactEvent.Details.ContactData !== undefined &&
          contactEvent.Details.ContactData.Attributes !== undefined)
      {
        inferenceUtils.updateState(customerState, stateToSave, 'ContactAttributes', commonUtils.clone(contactEvent.Details.ContactData.Attributes));
      }
      else
      {
        inferenceUtils.updateState(customerState, stateToSave, 'ContactAttributes', {});
      }

      if (customerState.ContactAttributes.RulesEngineEndPoint !== undefined)
      {
        console.info('Attempting to locate a rule set for RulesEngineEndPoint: ' + customerState.ContactAttributes.RulesEngineEndPoint);

        var nextRuleSet = endPointsMap.get(customerState.ContactAttributes.RulesEngineEndPoint);

        if (nextRuleSet !== null)
        {
          systemState.EndPoint = customerState.ContactAttributes.RulesEngineEndPoint;
          console.info(`Found ruleset: ${nextRuleSet.name} for attribute end point: ${customerState.ContactAttributes.RulesEngineEndPoint}`);
          inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', nextRuleSet.name);
        }
        else
        {
          var errorMessage = `Failed to find ruleset for attribute end point: ${customerState.ContactAttributes.RulesEngineEndPoint}`;
          console.error(errorMessage);
          throw new Error(errorMessage);
        }
      }

      inferenceUtils.updateState(customerState, stateToSave, 'System', systemState);
    }
  }
  catch (error)
  {
    console.error('Failed to create customer state', error);
    throw error;
  }
}

/**
 * Look for a customer phone number in the event, this can be undefined
 * if the customer has with-held caller id
 */
function storeCustomerPhone(contactId, contactEvent, customerState, stateToSave)
{
  if (customerState.CustomerPhoneNumber === undefined)
  {
    if (contactEvent.Details &&
        contactEvent.Details.ContactData &&
        contactEvent.Details.ContactData.CustomerEndpoint &&
        contactEvent.Details.ContactData.CustomerEndpoint.Address)
    {
      inferenceUtils.updateState(customerState, stateToSave, 'CustomerPhoneNumber', contactEvent.Details.ContactData.CustomerEndpoint.Address);
      console.info('Stored customer number: ' + customerState.CustomerPhoneNumber);
    }
  }

  if (customerState.OriginalCustomerNumber === undefined)
  {
    inferenceUtils.updateState(customerState, stateToSave, 'OriginalCustomerNumber', customerState.CustomerPhoneNumber);
  }

  return customerState.CustomerPhoneNumber;
}

/**
 * Load the current ruleset using this behaviour:
 *
 * 1) If there is a NextRuleSet in state load it and clear the NextRuleSet state
 * 2) If there is a CurrentRuleSet use it
 * 3) Look for a rule set using the dialled number
 * 4) Fail if we can't identify a current rule set
 */
function getCurrentRuleSet(contactId, customerState, stateToSave)
{
  try
  {
    var currentRuleSet = undefined;

    // If we have a next rule set locate it by name and clean up state
    if (customerState.NextRuleSet !== undefined)
    {
      // Logs ending a rule if there is one
      logRuleEnd(contactId, customerState);

      // Logs ending a rule set
      logRuleSetEnd(contactId, customerState, customerState.CurrentRuleSet, customerState.NextRuleSet);

      currentRuleSet = getRuleSetByName(contactId, customerState.NextRuleSet);

      // Remove the next rule set directive
      inferenceUtils.updateState(customerState, stateToSave, 'NextRuleSet', undefined);

      // Clear the current rule if it was set
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule', undefined);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRuleType', undefined);
      inferenceUtils.updateState(customerState, stateToSave, 'RuleStart', undefined);

      // Update the current rule set
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRuleSet', currentRuleSet.name);
      inferenceUtils.updateState(customerState, stateToSave, 'RuleSetStart', commonUtils.nowUTCMillis());

      // Logs starting a rule set
      logRuleSetStart(contactId, customerState, customerState.NextRuleSet, customerState.CurrentRuleSet);
    }
    // If we have a current rule set load it
    else if (customerState.CurrentRuleSet !== undefined)
    {
      currentRuleSet = getRuleSetByName(contactId, customerState.CurrentRuleSet);
    }
    // Look for a rule set using the dialled number
    else
    {
      console.info('Looking for a rule set using dialled number: ' + customerState.System.DialledNumber);
      currentRuleSet = getRuleSetByDialledNumber(contactId, customerState.System.DialledNumber);

      // Update the current rule set
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRuleSet', currentRuleSet.name);
      inferenceUtils.updateState(customerState, stateToSave, 'RuleSetStart', commonUtils.nowUTCMillis());

      // Clear the current rule if it was set
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule', undefined);
      inferenceUtils.updateState(customerState, stateToSave, 'CurrentRuleType', undefined);
      inferenceUtils.updateState(customerState, stateToSave, 'RuleStart', undefined);

      // Logs starting a rule set
      logRuleSetStart(contactId, customerState, customerState.CurrentRuleSet, null);
    }
  }
  catch (error)
  {
    console.error(`Failed to locate rule set for contact id: ${contactId}`, error);
    throw error;
  }

  return currentRuleSet;
}

/**
 * Find a rule set by name returning undefined if not found.
 * RuleSets might be missing if they are disabled.
 */
function getRuleSetByName(contactId, ruleSetName)
{
  var ruleSet = ruleSetsMap.get(ruleSetName);

  if (ruleSet === undefined)
  {
    throw new Error(`Failed to find rule set for name: ${ruleSetName} for contact id: ${contactId}`);
  }

  return commonUtils.clone(ruleSet);
}

/**
 * Locate a rule set using the dialled number which now involves
 * looking up the end point for this number and then the rule set for
 * that end pint
 */
function getRuleSetByDialledNumber(contactId, dialledNumber)
{
  var endPoint = inboundNumbersMap.get(dialledNumber);

  if (endPoint === undefined)
  {
    throw new Error(`Failed to find end point by dialled number: ${dialledNumber} for contact id: ${contactId}`);
  }

  console.info('Found end point: ' + JSON.stringify(endPoint, null, 2));

  var ruleSet = endPointsMap.get(endPoint.name);

  if (ruleSet === undefined)
  {
    throw new Error(`Failed to find rule set by dialled number: ${dialledNumber} and end point: ${endPoint.name} for contact id: ${contactId}`);
  }

  return commonUtils.clone(ruleSet);
}

/**
 * Prunes old rule state so we don't pollute between rules
 */
function pruneOldRuleState(contactId, customerState, stateToSave)
{
  var stateKeys = Object.keys(customerState);

  stateKeys.forEach(key => {
    if (key.startsWith('CurrentRule_'))
    {
      inferenceUtils.updateState(customerState, stateToSave, key, undefined);
    }
  });

  inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule', undefined);
  inferenceUtils.updateState(customerState, stateToSave, 'CurrentRuleType', undefined);
  inferenceUtils.updateState(customerState, stateToSave, 'RuleStart', undefined);
}

/**
 * Look for the next rule, starting from the current rule's index + 1
 */
function getNextRuleIndex(contactId, currentRuleSet, customerState, stateToSave)
{
  var startIndex = 0;

  if (customerState.CurrentRule !== undefined)
  {
    startIndex = getRuleIndexByName(contactId, currentRuleSet, customerState.CurrentRule) + 1;
  }

  if (startIndex >= currentRuleSet.rules.length)
  {
    var returnItem = peekReturnStack(customerState);

    if (returnItem !== undefined)
    {
      startIndex = -1;
    }
    else
    {
      throw new Error(`Contact id: ${contactId} reached the end of a rulesets rules with no return stack: ${currentRuleSet.name}`);
    }
  }

  return startIndex;
}

/**
 * Find the index of a rule by name on a rule set
 * throwing an error if not found
 */
function getRuleIndexByName(contactId, ruleSet, ruleName)
{
  for (var i = 0; i < ruleSet.rules.length; i++)
  {
    if (ruleSet.rules[i].name === ruleName)
    {
      return i;
    }
  }

  throw new Error(`Failed locate rule by name: ${ruleName} on rule set: ${ruleSet.name} for contact id: ${contactId}`);
}

/**
 * Export rule properties into customer state
 */
function exportRuleIntoState(contactId, nextRule, contactFlows, customerState, stateToSave)
{
  // Clear old the old rule's state
  pruneOldRuleState(contactId, customerState, stateToSave);

  var nextFlowName = 'RulesEngine' + nextRule.type;

  // May be undefined for non-connect rule types
  var nextFlow = contactFlows.find(flow => flow.Name === nextFlowName);

  if (nextFlow !== undefined)
  {
    inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_nextFlowArn', nextFlow.Arn);
  }

  inferenceUtils.updateState(customerState, stateToSave, 'CurrentRuleType', nextRule.type);
  inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule', nextRule.name);
  inferenceUtils.updateState(customerState, stateToSave, 'RuleStart', commonUtils.nowUTCMillis());

  var paramKeys = Object.keys(nextRule.params);

  paramKeys.forEach(key => {
    inferenceUtils.updateState(customerState, stateToSave, 'CurrentRule_' + key, nextRule.params[key]);
  });
}

/**
 * Logs starting a rule set
 */
function logRuleSetStart(contactId, customerState, current, previous)
{
  var now = moment();
  var logPayload = {
    EventType: 'ANALYTICS',
    EventCode: 'RULESET_START',
    ContactId: contactId,
    RuleSet: current,
    Previous: previous,
    When: customerState.RuleSetStart
  };
  console.info(JSON.stringify(logPayload, null, 2));
}

/**
 * Logs ending a rule set
 */
function logRuleSetEnd(contactId, customerState, current, next)
{
  if (customerState.CurrentRuleSet !== undefined)
  {
    var now = moment();
    var timeCost = 0;

    if (customerState.RuleSetStart != undefined)
    {
      timeCost = now.diff(moment(customerState.RuleSetStart));
    }

    var logPayload = {
      EventType: 'ANALYTICS',
      EventCode: 'RULESET_END',
      ContactId: contactId,
      RuleSet: current,
      Next: next,
      When: commonUtils.nowUTCMillis(),
      TimeCost: timeCost
    };
    console.info(JSON.stringify(logPayload, null, 2));
  }
}

/**
 * Logs starting a rule
 */
function logRuleStart(contactId, customerState)
{
  // Log a payload to advise the status of this menu
  var logPayload = {
    EventType: 'ANALYTICS',
    EventCode: 'RULE_START',
    ContactId: contactId,
    RuleSet: customerState.CurrentRuleSet,
    RuleType: customerState.CurrentRuleType,
    RuleName: customerState.CurrentRule,
    When: customerState.RuleStart
  };
  console.info(JSON.stringify(logPayload, null, 2));
}

/**
 * Logs ending a rule
 */
function logRuleEnd(contactId, customerState)
{
  if (customerState.CurrentRule !== undefined)
  {
    var now = moment();
    var timeCost = 0;

    if (customerState.RuleStart !== undefined)
    {
      timeCost = now.diff(moment(customerState.RuleStart));
    }

    var logPayload = {
      EventType: 'ANALYTICS',
      EventCode: 'RULE_END',
      ContactId: contactId,
      RuleSet: customerState.CurrentRuleSet,
      RuleType: customerState.CurrentRuleType,
      RuleName: customerState.CurrentRule,
      When: commonUtils.nowUTCMillis(),
      TimeCost: timeCost
    };
    console.info(JSON.stringify(logPayload, null, 2));
  }
}

/**
 * Peeks into the return stack
 */
function peekReturnStack(customerState)
{
  if (customerState.ReturnStack !== undefined &&
      Array.isArray(customerState.ReturnStack) &&
      customerState.ReturnStack.length > 0)
  {
    var returnItem = customerState.ReturnStack[customerState.ReturnStack.length - 1];

    console.info('Peeked return stack item: ' + JSON.stringify(returnItem, null, 2));

    return returnItem;
  }

  return undefined;
}

/**
 * Pushes the return stack
 */
function pushReturnStack(ruleSetName, ruleName, customerState, stateToSave)
{
  if (customerState.ReturnStack === undefined)
  {
    customerState.ReturnStack = [];
  }

  var returnItem = {
    ruleSetName: ruleSetName,
    ruleName: ruleName
  };

  customerState.ReturnStack.push(returnItem);

  console.info('Pushed the return stack which is now: ' + JSON.stringify(customerState.ReturnStack, null, 2));

  inferenceUtils.updateState(customerState, stateToSave, 'ReturnStack', customerState.ReturnStack);
}

/**
 * Pops the return stack returning undefined if there is no return stack item
 * available
 */
function popReturnStack(customerState, stateToSave)
{
  if (customerState.ReturnStack !== undefined &&
      Array.isArray(customerState.ReturnStack) &&
      customerState.ReturnStack.length > 0)
  {
    var returnItem = customerState.ReturnStack.pop();
    console.info('Popped return stack item: ' + JSON.stringify(returnItem, null, 2));
    inferenceUtils.updateState(customerState, stateToSave, 'ReturnStack', customerState.ReturnStack);
    return returnItem;
  }

  return undefined;
}

