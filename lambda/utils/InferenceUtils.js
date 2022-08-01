
var dynamoUtils = require('./DynamoUtils');
var rulesEngine = require('./RulesEngine');
var operatingHoursUtils = require('./OperatingHoursUtils')
var configUtils = require('./ConfigUtils.js');
var pollyUtils = require('./PollyUtils.js');

var moment = require('moment-timezone');
var weighted = require('weighted');

// Rule sets and config cache
var ruleSets = undefined;
var ruleSetsMap = undefined;
var endPointsMap = undefined;

/**
 * Clears the cache
 */
module.exports.clearCache = async () =>
{
  ruleSets = undefined;
  ruleSetsMap = undefined;
  endPointsMap = undefined;
};

/**
 * Fetches cached rule sets
 */
module.exports.getRuleSets = () =>
{
  return ruleSets;
};

/**
 * Load cached rule sets, the cache is always checked at the start of inferencing
 */
module.exports.cacheRuleSets = async (ruleSetTable, rulesTable) =>
{
  if (ruleSetsMap !== undefined && endPointsMap !== undefined && ruleSets !== undefined)
  {
    return;
  }

  ruleSets = await dynamoUtils.getRuleSetsAndRules(ruleSetTable, rulesTable);

  // Filter out disabled rule sets
  ruleSets = ruleSets.filter(ruleSet => ruleSet.enabled === true);

  // Filter out disabled rules
  ruleSets.forEach(ruleSet => {
    ruleSet.rules = ruleSet.rules.filter(rule => rule.enabled === true);
  });

  ruleSetsMap = new Map();
  endPointsMap = new Map();

  // Build name and inbound number based indices for active rule sets
  ruleSets.forEach(ruleSet => {
    ruleSetsMap.set(ruleSet.name, ruleSet);
    ruleSet.endPoints.forEach(endPoint => {
      endPointsMap.set(endPoint, ruleSet);
    });
  });

  console.info(`Loaded ${ruleSets.length} filtered rule sets into cache`);
};

/**
 * If there is no System customer state, compute one.
 * This calculates the end point, call timestamps,
 * morning / afternoon flags and holiday status.
 * This also stores the initial contact attributes in
 * customerState.ContactAttributes
 */
module.exports.initialiseState = async (
  configTable,
  contactId,
  endPoint,
  interactionDateTime,
  contactAttributes,
  customerState,
  stateToSave) =>
{
  try
  {
    // Set up empty system state
    if (customerState.System === undefined)
    {
      var timeZone = await configUtils.getCallCentreTimeZone(configTable);

      var utcTime = moment(interactionDateTime).utc();
      var localTime = moment(utcTime).tz(timeZone);
      var localHour = localTime.hour();

      var isHoliday = await operatingHoursUtils.isHoliday(configTable, utcTime);

      var systemState = {
        ContactId: contactId,
        EndPoint: endPoint,
        Holiday: '' + isHoliday,
        DateTimeUTC: utcTime.format(),
        DateTimeLocal: localTime.format(),
        TimeLocal: localTime.format('hh:mm A'),
        TimeOfDay: module.exports.getTimeOfDay(localHour)
      };

      module.exports.updateState(customerState, stateToSave, 'ContactId', contactId);
      module.exports.updateState(customerState, stateToSave, 'System', systemState);
    }

    // Store initial contact attributes in state
    if (customerState.ContactAttributes === undefined)
    {
      customerState.ContactAttributes = {};

      if (contactAttributes !== undefined)
      {
        module.exports.updateState(customerState, stateToSave, 'ContactAttributes', contactAttributes);
      }
      else
      {
        module.exports.updateState(customerState, stateToSave, 'ContactAttributes', {});
      }

      console.info('Stored initial contact attributes: ' + JSON.stringify(customerState.ContactAttributes, null, 2));
    }
  }
  catch (error)
  {
    console.error('Failed to initialise state', error);
    throw error;
  }
}

/**
 * Fetches the time of day
 */
module.exports.getTimeOfDay = (hour) =>
{
  if (hour < 12)
  {
    return 'morning';
  }
  else if (hour >= 12 && hour < 18)
  {
    return 'afternoon';
  }
  else
  {
    return 'evening';
  }
};

/**
 * Look for a customer phone number in the event, this can be undefined
 * if the customer has with-held caller id or end point only calls
 */
module.exports.storeCustomerPhone = (contactId, customerPhoneNumber, customerState, stateToSave) =>
{
  if (customerState.CustomerPhoneNumber === undefined)
  {
    module.exports.updateState(customerState, stateToSave, 'CustomerPhoneNumber', customerPhoneNumber);
    console.info('Stored customer number: ' + customerState.CustomerPhoneNumber);
  }

  if (customerState.OriginalCustomerNumber === undefined)
  {
    module.exports.updateState(customerState, stateToSave, 'OriginalCustomerNumber', customerState.CustomerPhoneNumber);
  }
};

/**
 * Export rule properties into customer state
 */
module.exports.exportRuleIntoState = (contactId, nextRule, contactFlows, customerState, stateToSave) =>
{
  // Clear old the old rule's state
  module.exports.pruneOldRuleState(contactId, customerState, stateToSave);

  var nextFlowName = 'RulesEngine' + nextRule.type;

  // May be undefined for non-connect rule types
  var nextFlow = contactFlows.find(flow => flow.Name === nextFlowName);

  if (nextFlow !== undefined)
  {
    module.exports.updateState(customerState, stateToSave, 'CurrentRule_nextFlowArn', nextFlow.Arn);
  }

  module.exports.updateState(customerState, stateToSave, 'CurrentRuleType', nextRule.type);
  module.exports.updateState(customerState, stateToSave, 'CurrentRule', nextRule.name);
  module.exports.updateState(customerState, stateToSave, 'RuleStart', moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'));

  var paramKeys = Object.keys(nextRule.params);

  paramKeys.forEach(key => {
    module.exports.updateState(customerState, stateToSave, 'CurrentRule_' + key, nextRule.params[key]);
  });
};

/**
 * Prunes old rule state so we don't pollute between rules
 */
module.exports.pruneOldRuleState = (contactId, customerState, stateToSave) =>
{
  var stateKeys = Object.keys(customerState);

  stateKeys.forEach(key =>
  {
    if (key.startsWith('CurrentRule_'))
    {
      module.exports.updateState(customerState, stateToSave, key, undefined);
    }
  });

  module.exports.updateState(customerState, stateToSave, 'CurrentRule', undefined);
  module.exports.updateState(customerState, stateToSave, 'CurrentRuleType', undefined);
  module.exports.updateState(customerState, stateToSave, 'RuleStart', undefined);
};

/**
 * Find a rule set by name returning undefined if not found.
 * RuleSets might be missing if they are disabled.
 */
module.exports.getRuleSetByName = (contactId, ruleSetName) =>
{
  var ruleSet = ruleSetsMap.get(ruleSetName);

  if (ruleSet === undefined)
  {
    throw new Error(`ContactId: ${contactId} Failed to find rule set for name: ${ruleSetName}`);
  }

  return clone(ruleSet);
};

/**
 * Given a rule set name find the named rule on it
 */
module.exports.getRuleByName = (contactId, ruleSetName, ruleName) =>
{
  var ruleSet = ruleSetsMap.get(ruleSetName);

  if (ruleSet === undefined)
  {
    throw new Error(`Failed to find rule set for name: ${ruleSetName} for contact id: ${contactId}`);
  }

  var rule = ruleSet.rules.find(rule => rule.name === ruleName);

  if (rule === undefined)
  {
    throw new Error(`Failed to find rule: ${ruleName} on rule set: ${ruleSetName} for contact id: ${contactId}`);
  }

  return clone(rule);
};

/**
 * Look for the next rule, starting from the current rule's index + 1
 * if we reach the end of a rule set and we have a ReturnStack then reurn -1
 * otherwise error
 */
module.exports.getNextRuleIndex = (contactId, currentRuleSet, customerState, stateToSave) =>
{
  var startIndex = 0;

  if (customerState.CurrentRule !== undefined)
  {
    startIndex = module.exports.getRuleIndexByName(contactId, currentRuleSet, customerState.CurrentRule) + 1;
  }

  if (startIndex >= currentRuleSet.rules.length)
  {
    var returnItem = module.exports.peekReturnStack(customerState);

    if (returnItem !== undefined)
    {
      startIndex = -1;
    }
    else
    {
      throw new Error(`Contact id: ${contactId} reached the end of a ruleset with no return stack: ${currentRuleSet.name}`);
    }
  }

  return startIndex;
};

/**
 * Peeks into the return stack
 */
module.exports.peekReturnStack = (customerState) =>
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
};


/**
 * Pushes the return stack
 */
module.exports.pushReturnStack = (ruleSetName, ruleName, customerState, stateToSave) =>
{
  if (customerState.ReturnStack === undefined)
  {
    customerState.ReturnStack = [];
  }

  customerState.ReturnStack.push({
    ruleSetName: ruleSetName,
    ruleName: ruleName
  });

  module.exports.updateState(customerState, stateToSave, 'ReturnStack', customerState.ReturnStack);
};

/**
 * Pops the return stack returning undefined if there is no return stack item
 * available
 */
module.exports.popReturnStack = (customerState, stateToSave) =>
{
  if (customerState.ReturnStack !== undefined &&
      Array.isArray(customerState.ReturnStack) &&
      customerState.ReturnStack.length > 0)
  {
    var returnItem = customerState.ReturnStack.pop();
    console.info('Popped return stack item: ' + JSON.stringify(returnItem, null, 2));
    module.exports.updateState(customerState, stateToSave, 'ReturnStack', customerState.ReturnStack);
    return returnItem;
  }

  return undefined;
};

/**
 * Find the index of a rule by name on a rule set
 * throwing an error if not found
 */
module.exports.getRuleIndexByName = (contactId, ruleSet, ruleName) =>
{
  for (var i = 0; i < ruleSet.rules.length; i++)
  {
    if (ruleSet.rules[i].name === ruleName)
    {
      return i;
    }
  }

  throw new Error(`Failed locate rule by name: [${ruleName}] on rule set: [${ruleSet.name}] for contact id: [${contactId}]`);
};

/**
 * Locate a rule set using an end point name
 */
module.exports.getRuleSetByEndPoint = (endPoint) =>
{
  var ruleSet = endPointsMap.get(endPoint);

  if (ruleSet === undefined)
  {
    return undefined;
  }

  return clone(ruleSet);
};

/**
 * Clears the customer state fields when we are reloading customer data
 */
module.exports.clearCustomerState = (customerState, stateToSave) =>
{
  // Clear the no accounts flag
  module.exports.updateState(customerState, stateToSave, 'NoAccounts', undefined);

  // Clean out the AccountDisambiguate flag
  module.exports.updateState(customerState, stateToSave, 'AccountDisambiguate', undefined);
};

/**
 * Writes to in memory state tracking changes for persisting.
 * Deletes are represented as undefined values.
 * Attempts to immediately parse incoming JSON values.
 */
module.exports.updateState = (customerState, stateToSave, key, value) =>
{
  if (value === undefined && customerState[key] === undefined)
  {
    return;
  }

  var rawValue = value;

  if (typeof rawValue === 'string')
  {
    if ((rawValue.startsWith('{') && rawValue.endsWith('}')) ||
        (rawValue.startsWith('[') && rawValue.endsWith(']')))
    {
      try
      {
        rawValue = JSON.parse(rawValue);
      }
      catch (error)
      {
        console.error(`Failed to parse JSON state value for key: ${key} writing as a string, cause: ${error.message}`);
      }
    }
  }

  customerState[key] = rawValue;
  stateToSave.add(key);
};

/**
 * Updates customer state using a context wrapper
 * Writes to in memory state tracking changes for persisting.
 * Deletes are represented as undefined values
 */
module.exports.updateStateContext = (context, key, value) =>
{
  module.exports.updateState(context.customerState, context.stateToSave, key, value);
};


/**
 * Clones an object
 */
function clone(object)
{
  return JSON.parse(JSON.stringify(object));
}

/**
 * Logs starting an integration function
 */
module.exports.logIntegrationRun = (contactId, customerState) =>
{
  var now = moment();
  var logPayload = {
    EventType: 'ANALYTICS',
    EventCode: 'INTEGRATION_RUN',
    ContactId: contactId,
    RuleSet: customerState.CurrentRuleSet,
    Rule: customerState.CurrentRule,
    RuleType: customerState.CurrentRuleType,
    FunctionName: customerState.CurrentRule_functionName,
    Status: 'RUN',
    When: now.format('YYYY-MM-DDTHH:mm:ss.SSSZ')
  };
  console.info(JSON.stringify(logPayload, null, 2));
};

/**
 * Logs ending an integration function
 */
module.exports.logIntegrationEnd = (contactId, customerState, status, error) =>
{
  var now = moment();

  var timeCost = 0;

  if (customerState.IntegrationStart != undefined)
  {
    timeCost = now.diff(moment(customerState.IntegrationStart));
  }

  var logPayload = {
    EventType: 'ANALYTICS',
    EventCode: 'INTEGRATION_END',
    ContactId: contactId,
    RuleSet: customerState.CurrentRuleSet,
    Rule: customerState.CurrentRule,
    RuleType: customerState.CurrentRuleType,
    FunctionName: customerState.CurrentRule_functionName,
    Status: status,
    ErrorCause: error !== undefined ? error.message : undefined,
    When: now.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    Cost: timeCost
  };

  console.info(JSON.stringify(logPayload, null, 2));
};

/**
 * Logs starting a rule set
 */
module.exports.logRuleSetStart = (contactId, customerState, current, previous) =>
{
  var now = moment();

  var actualPrevious = null;

  if (previous !== undefined)
  {
    actualPrevious = previous;
  }

  var logPayload = {
    EventType: 'ANALYTICS',
    EventCode: 'RULESET_START',
    ContactId: contactId,
    RuleSet: current,
    Previous: actualPrevious,
    When: customerState.RuleSetStart
  };
  console.info(JSON.stringify(logPayload, null, 2));
};

/**
 * Logs ending a rule set
 */
module.exports.logRuleSetEnd = (contactId, customerState, current, next) =>
{
  if (customerState.CurrentRuleSet !== undefined)
  {
    var now = moment();
    var timeCost = 0;

    if (customerState.RuleSetStart != undefined)
    {
      timeCost = now.diff(moment(customerState.RuleSetStart));
    }

    var actualNext = null;

    if (next !== undefined)
    {
      actualNext = next;
    }

    var logPayload = {
      EventType: 'ANALYTICS',
      EventCode: 'RULESET_END',
      ContactId: contactId,
      RuleSet: current,
      Next: actualNext,
      When: now.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      TimeCost: timeCost
    };
    console.info(JSON.stringify(logPayload, null, 2));
  }
};

/**
 * Logs starting a rule
 */
module.exports.logRuleStart = (contactId, customerState) =>
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
};

/**
 * Logs ending a rule
 */
module.exports.logRuleEnd = (contactId, customerState) =>
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
      When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      TimeCost: timeCost
    };
    console.info(JSON.stringify(logPayload, null, 2));
  }
};

/**
 * Render voice if we are requested or return undefined
 */
module.exports.renderVoice = async (requestMessage, text) =>
{
  if (requestMessage.generateVoice === true)
  {
    // Allow optional overrides to voice id and language code
    var voiceId = 'Olivia';
    var languageCode = 'en-AU';

    if (process.env.VOICE_ID !== undefined)
    {
      voiceId = process.env.VOICE_ID;
    }

    if (process.env.VOICE_LANGUAGE !== undefined)
    {
      languageCode = process.env.VOICE_LANGUAGE;
    }

    return await pollyUtils.synthesizeVoice(text, voiceId, languageCode);
  }
  else
  {
    return undefined;
  }
};

/**
 * Checks to see if this value undefined, null or the empty string
 */
module.exports.isEmptyString = (value) =>
{
  if (value === undefined ||
    value === null ||
    value === '')
  {
    console.info('isEmptyString() Value was an empty string');
    return true;
  }
  else
  {
    console.info(`isEmptyString() Value was not empty string: [${value}]`);
    return false;
  }
};

/**
 * Checks to see if value is a number
 */
module.exports.isNumber = (value) =>
{
  if (value === undefined ||
      value === null ||
      value === '' ||
      value === true ||
      value === false ||
      isNaN(value))
  {
    return false;
  }
  else
  {
    return true;
  }
};

/**
 * Returns true if the value is null or undefined or equal to the string
 * 'null' or 'undefined'
 */
module.exports.isNullOrUndefined = (value) =>
{
  if (value === undefined ||
      value === null ||
      value === 'null' ||
      value === 'undefined')
  {
    return true;
  }
  else
  {
    return false;
  }
};

/**
 * Given a distribution rule config in customer state
 * with percentage weighted rule sets and a default rule set,
 * compute the next rule set using the probabiity as a weight
 */
module.exports.solveDistribution = (customerState) =>
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
};

/**
 * Sleep for time millis
 */
module.exports.sleep = (time) =>
{
  return new Promise((resolve) => setTimeout(resolve, time));
};

/**
 * Walks a JSON path to fetch a state value
 */
module.exports.getStateValueForPath = (path, customerState) =>
{
  try
  {
    var fields = path.split(/\./);

    var rawValue = customerState;

    fields.forEach(field =>
    {
      // Allow length as selection for raw values for arrays
      if (field === 'length' && Array.isArray(rawValue))
      {
        rawValue = rawValue.length;
      }
      else if (rawValue === undefined)
      {
        return undefined;
      }
      else
      {
        rawValue = rawValue[field];
      }
    });

    return rawValue;
  }
  catch (error)
  {
    console.error('Failed to fetch raw value for field: ' + path, error);
    return undefined;
  }
};

