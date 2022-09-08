// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const handlebarsUtils = require('./HandlebarsUtils');
const commonUtils = require('./CommonUtils');

/**
 * Maintain a list of rule parameters that are not templated
 * at the rule invocation phase, this includes things like confirmation
 * messages that are processed after fetching input and may refer to input
 * parameters
 */
var ignoredFields = getIgnoredTemplateFields();

function getIgnoredTemplateFields()
{
  var ignored = new Set();

  // DTMFInput and NLUInput confirmationMessage is used to confirm the input value back to customer
  ignored.add('confirmationMessage');

  // NLUInput and NLUMenu autoConfirmMessage may contain input values
  ignored.add('autoConfirmMessage');

  // SetAttributes setAttributes is an array of attributes that needs to be templated
  ignored.add('setAttributes');

  // UpdateStates updateStates is an array of state attributes that needs to be templated
  ignored.add('updateStates');

  return ignored;
}

/**
 * Fetches the next rule from a start index
 */
module.exports.getNextActivatedRule = async function(stage, service,
    region, accountNumber,
    contactId, rules, startIndex,
    customerState, queues, prompts,
    contactFlows, lambdaFunctions,
    lexBots)
{
  var nextRule = undefined;

  for (var i = startIndex; i < rules.length; i++)
  {
    // Test the rule, these are always cloned above so changes are ok
    testRule(customerState, rules[i]);

    // Check for activation
    if (rules[i].activated)
    {
      nextRule = rules[i];
      break;
    }
  }

  if (nextRule === undefined)
  {
    console.info(`Contact id: ${contactId} found no next active rule in ruleset returning undefined so we can check return stack`);
    return undefined;
  }

  template(nextRule, customerState, ignoredFields);
  await module.exports.lookup(stage, service, region, accountNumber,
    nextRule.params, queues, prompts, contactFlows,
    lambdaFunctions, lexBots);

  return nextRule;
}

/**
 * Given a rule set, find any rule sets that point to this rule set
 * returning map of rule set names against an array of matching rules
 */
module.exports.getReferringRuleSets = function(ruleSet, ruleSets)
{
  var referring = {};

  var testName = ruleSet.name;

  ruleSets.forEach(rs => {

    var matchingRules = [];

    rs.rules.forEach(rule => {

      if (rule.type === 'DTMFMenu')
      {
        var added = false;

        if (rule.params.errorRuleSetName === testName)
        {
          matchingRules.push(rule);
          added = true;
        }

        if (rule.params.noInputRuleSetName === testName)
        {
          matchingRules.push(rule);
          added = true;
        }

        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.startsWith('dtmf') && rule.params[key] === testName)
          {
            if (!added)
            {
              matchingRules.push(rule);
              added = true;
            }
          }
        });
      }

      if (rule.type === 'NLUMenu')
      {
        var added = false;

        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.startsWith('intentRuleSet_') && rule.params[key] === testName)
          {
            if (!added)
            {
              matchingRules.push(rule);
              added = true;
            }
          }
        });
      }

      if (rule.type === 'RuleSet')
      {
        if (rule.params.ruleSetName === testName)
        {
          matchingRules.push(rule);
        }
      }

      if (rule.type === 'DTMFInput')
      {
        if (rule.params.errorRuleSetName === testName)
        {
          matchingRules.push(rule);
        }
      }

      if (rule.type === 'Queue')
      {
        // Check for fallback rulesets for out of hours and unstaffed
        if (rule.params.outOfHoursRuleSetName === testName ||
            rule.params.unstaffedRuleSetName === testName)
        {
          matchingRules.push(rule);
        }
      }
    });

    // TODO if a flow exists as a DTMF menu and as
    // an error rule set this may fail, distinct rules?
    if (matchingRules.length > 0)
    {
      referring[rs.name] = matchingRules;
    }
  });

  return referring;
}

/**
 * Given a rule set, load an array of rules that point to this rule set
 * thi sis used during renaming of rules
 */
module.exports.getReferringRules = function(ruleSet, ruleSets)
{
  var referringRules = [];

  var testName = ruleSet.name;

  ruleSets.forEach(rs => {

    rs.rules.forEach(rule => {

      if (rule.type === 'DTMFMenu')
      {

        var added = false;

        if (rule.params.errorRuleSetName === testName)
        {
          referringRules.push(rule);
          added = true;
        }

        if (rule.params.noInputRuleSetName === testName)
        {
          referringRules.push(rule);
          added = true;
        }

        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.startsWith('dtmf') && rule.params[key] === testName)
          {
            if (!added)
            {
              referringRules.push(rule);
              added = true;
            }
          }
        });
      }

      if (rule.type === 'NLUMenu')
      {

        var added = false;

        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.startsWith('intentRuleSet_') && rule.params[key] === testName)
          {
            if (!added)
            {
              referringRules.push(rule);
              added = true;
            }
          }
        });
      }

      if (rule.type === 'RuleSet')
      {
        if (rule.params.ruleSetName === testName)
        {
          referringRules.push(rule);
        }
      }

      if (rule.type === 'DTMFInput')
      {
        if (rule.params.errorRuleSetName === testName)
        {
          referringRules.push(rule);
        }
      }

      if (rule.type === 'Queue')
      {
        // Check for fallback rulesets for out of hours and unstaffed
        if (rule.params.outOfHoursRuleSetName === testName ||
            rule.params.unstaffedRuleSetName === testName)
        {
          referringRules.push(rule);
        }
      }
    });
  });

  return referringRules;
}

/**
 * Look up queue and contact flow ids and Arns
 */
module.exports.lookup = async function (stage, service, region, accountNumber,
  ruleParams, queues, prompts, contactFlows, lambdaFunctions, lexBots)
{
  if (ruleParams.queueName !== undefined)
  {
    var queue = queues.find((q) => q.Name === ruleParams.queueName);

    if (queue !== undefined)
    {
      ruleParams.queueId = queue.Id;
      ruleParams.queueArn = queue.Arn;
    }
    else
    {
      throw new Error('Could not find queue: ' + ruleParams.queueName);
    }
  }

  if (ruleParams.unstaffedQueueName !== undefined)
  {
    var queue = queues.find((q) => q.Name === ruleParams.unstaffedQueueName);

    if (queue !== undefined)
    {
      ruleParams.unstaffedQueueId = queue.Id;
      ruleParams.unstaffedQueueArn = queue.Arn;
    }
    else
    {
      throw new Error('Could not find unstaffed queue: ' + ruleParams.unstaffedQueueName);
    }
  }

  if (ruleParams.flowName !== undefined)
  {
    var contactFlow = contactFlows.find((flow) => flow.Name === ruleParams.flowName);

    if (contactFlow !== undefined)
    {
      ruleParams.flowId = contactFlow.Id;
      ruleParams.flowArn = contactFlow.Arn;
    }
    else
    {
      throw new Error('Could not find contact flow: ' + ruleParams.flowName);
    }
  }

  if (ruleParams.lexBotName !== undefined)
  {
    var fullBotName = `${stage}-${service}-${ruleParams.lexBotName}`;
    var deployedLexBot = lexBots.find((lexBot) => fullBotName === lexBot.Name);

    if (deployedLexBot !== undefined)
    {
      ruleParams.lexBotArn = deployedLexBot.Arn;
      console.log('[INFO] resolved lex bot arn: ' + ruleParams.lexBotArn);
    }
    else
    {
      throw new Error('Failed to locate lex bot: ' + fullBotName);
    }
  }

  if (ruleParams.functionName !== undefined)
  {
    var functionName = `${stage}-${service}-${ruleParams.functionName}`;

    var lambdaFunction = lambdaFunctions.find(lambdaFunction => lambdaFunction.Name === functionName);

    if (lambdaFunction !== undefined)
    {
      ruleParams.functionArn = lambdaFunction.Arn;
    }
    else
    {
      throw new Error('Could not find lambda function: ' + functionName);
    }
  }

  // Look at each message and determine a message type override is required
  var keys = Object.keys(ruleParams);

  keys.forEach(key =>
  {
    // Handle empty error rule set names so we can test for them
    if (key === 'errorRuleSetName')
    {
      var value = ruleParams[key];

      if (value === '')
      {
        ruleParams[key + 'Set'] = 'false';
      }
      else
      {
        ruleParams[key + 'Set'] = 'true';
      }
    }

    if (key.toLowerCase().includes('message') && !key.endsWith('Type') && !key.endsWith('Arn'))
    {
      var value = ruleParams[key];

      if (value !== undefined && value !== null)
      {
        value = value.trim();
      }

      // Make missing messages output a type of none
      if (value === undefined || value === null || value.trim() === '')
      {
        ruleParams[key + 'Type'] = 'none';
      }
      // SSML starts with <speak>
      else if (value.startsWith('<speak>') && value.endsWith('</speak>'))
      {
        ruleParams[key + 'Type'] = 'ssml';
      }
      // Prompts start with prompt: and need an ARN lookup
      else if (value.startsWith('prompt:'))
      {
        // Split on new lines as we only care about the first line
        // and allow configuration to contain additional lines as documentation
        var promptLines = value.split(/\n/);
        var promptName = promptLines[0].trim().substring(7);
        var prompt = prompts.find((p) => p.Name === promptName);

        if (prompt !== undefined)
        {
          ruleParams[key + 'Type'] = 'prompt';
          ruleParams[key + 'PromptArn'] = prompt.Arn;
        }
        else
        {
          console.log('[ERROR] failed lookup prompt for message: ' + value);
        }
      }
      // Everything else is text (handled as the default case in the contact flows)
      else
      {
        ruleParams[key + 'Type'] = 'text';
      }
    }
  });
}

/**
 * Processes template based parameters
 */
function template(rule, customerState, ignoredFields = new Set())
{
  try
  {
    // Special processing for SetAttributes
    if (rule.type === 'SetAttributes')
    {
      for (var i = 0; i < rule.params.setAttributes.length; i++)
      {
        var attribute = rule.params.setAttributes[i];

        if (attribute.key === undefined ||
            attribute.key === '' ||
            attribute.value === undefined ||
            attribute.value === '')
        {
          console.error('Skipping empty attribute: ' + JSON.stringify(attribute));
          continue;
        }

        if (handlebarsUtils.isTemplate(attribute.value))
        {
          var templatedValue = handlebarsUtils.template(attribute.value, customerState);
          attribute.value = templatedValue;
        }
      }
    }

    // Special processing for UpdateStates rule
    if (rule.type === 'UpdateStates')
    {
      for (var i = 0; i < rule.params.updateStates.length; i++)
      {
        var stateItem = rule.params.updateStates[i];

        if (stateItem.key === undefined ||
            stateItem.key === '' ||
            stateItem.value === undefined ||
            stateItem.value === '')
        {
          console.error('Skipping empty state item: ' + JSON.stringify(stateItem));
          continue;
        }

        if (handlebarsUtils.isTemplate(stateItem.value))
        {
          var templatedValue = handlebarsUtils.template(stateItem.value, customerState);
          stateItem.value = templatedValue;
        }
      }
    }

    var keys = Object.keys(rule.params);

    keys.forEach(key => {

      if (!ignoredFields.has(key))
      {
        var rawValue = rule.params[key];

        // console.log('[DEBUG] checking template for key: ' + key + ' with value: ' + rawValue);

        if (handlebarsUtils.isTemplate(rawValue))
        {
          var templatedValue = handlebarsUtils.template(rawValue, customerState);
          rule.params[key] = templatedValue;
        }
      }
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to template a rule', error);
    throw error;
  }
}

/**
 * Tests a rule for activation
 */
function testRule(customerState, rule)
{
  rule.activated = false;
  rule.weight = 0;

  /**
   * Compute the weight from each sub rule
   */
  rule.weights.forEach(weight =>
  {
    weight.activated = false;

    if (weight.value !== undefined && weight.value !== null)
    {
      weight.value = weight.value.trim();
    }

    if (weight.field !== undefined && weight.field !== null)
    {
      weight.field = weight.field.trim();
    }

    // Fetch the raw value which is object path aware
    var rawValue = getRawValue(weight, customerState);

    // Resolve weight values that are templates
    resolveWeightValue(weight, customerState);

    if (evaluateWeight(weight, rawValue))
    {
      rule.weight += +weight.weight;
      weight.activated = true;
    }
  });

  if (+rule.weight >= +rule.activation)
  {
    rule.activated = true;
  }

  rule.weight = '' + rule.weight;
}

/**
 * When weight values are templates, try and resolve them
 */
function resolveWeightValue(weight, customerState)
{
  try
  {
    if (handlebarsUtils.isTemplate(weight.value))
    {
      weight.value = handlebarsUtils.template(weight.value, customerState);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to resolve value for weight: ' + JSON.stringify(weight, null, 2), error);
  }
}

/**
 * Fetches the raw value for a weight handling splitting
 * up based on . path components and processing templates separately
 */
function getRawValue(weight, customerState)
{
  try
  {
    var rawFieldName = weight.field;

    var fields = rawFieldName.split(/\./);

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
    console.log('[ERROR] failed to fetch raw template value for weight: ' + JSON.stringify(weight, null, 2), error);
    return undefined;
  }
}

/**
 * Evaluates a weight with the raw value
 */
function evaluateWeight(weight, rawValue)
{
  switch(weight.operation)
  {
    case 'contains':
    {
      return weightContains(weight, rawValue);
    }
    case 'notcontains':
    {
      return weightNotContains(weight, rawValue);
    }
    case 'endswith':
    {
      return weightEndsWith(weight, rawValue);
    }
    case 'notendswith':
    {
      return weightNotEndsWith(weight, rawValue);
    }
    case 'equals':
    {
      return weightEquals(weight, rawValue);
    }
    case 'notequals':
    {
      return !weightEquals(weight, rawValue);
    }
    case 'isempty':
    {
      return weightIsEmpty(weight, rawValue);
    }
    case 'isnotempty':
    {
      return !weightIsEmpty(weight, rawValue);
    }
    case 'isnull':
    {
      return weightIsNull(weight, rawValue);
    }
    case 'isnotnull':
    {
      return weightIsNotNull(weight, rawValue);
    }
    case 'ismobile':
    {
      return weightIsMobile(weight, rawValue);
    }
    case 'isnotmobile':
    {
      return weightIsNotMobile(weight, rawValue);
    }
    case 'lessthan':
    {
      return weightLessThan(weight, rawValue);
    }
    case 'greaterthan':
    {
      return weightGreaterThan(weight, rawValue);
    }
    case 'startswith':
    {
      return weightStartsWith(weight, rawValue);
    }
    case 'notstartswith':
    {
      return weightNotStartsWith(weight, rawValue);
    }
    default:
    {
      var errorMessage = `Unhandled weight operation: ${weight.operation}`;
      console.log('[ERROR] ' + errorMessage);
      throw new Error(errorMessage);
    }
  }
}

/**
 * Returns the weight if rawValue is an array that contains
 * the value or is a string that partially contains the value
 */
function weightContains(weight, rawValue)
{
  if (Array.isArray(rawValue) && rawValue.includes(weight.value))
  {
    return +weight.weight;
  }
  else if ((typeof rawValue === 'string') && rawValue.includes(weight.value))
  {
    return +weight.weight;
  }

  return 0;
}

/**
 * Returns the weight if rawValue is an array that doesn't contain
 * the value or is a string that does not contain the value
 */
function weightNotContains(weight, rawValue)
{
  if (Array.isArray(rawValue) && rawValue.includes(weight.value))
  {
    return 0;
  }
  else if ((typeof rawValue === 'string') && rawValue.includes(weight.value))
  {
    return 0;
  }

  return +weight.weight;
}

/**
 * Returns the weight if rawValue is a string that starts
 * with weight.value
 */
function weightStartsWith(weight, rawValue)
{
  if ((typeof rawValue === 'string') && rawValue.startsWith(weight.value))
  {
    return +weight.weight;
  }

  return 0;
}

/**
 * Returns the weight if rawValue is a string that starts
 * with weight.value
 */
function weightNotStartsWith(weight, rawValue)
{
  if ((typeof rawValue === 'string') && rawValue.startsWith(weight.value))
  {
    return 0;
  }

  return +weight.weight;
}

/**
 * Returns the weight if rawValue is a string that ends
 * with weight.value
 */
function weightEndsWith(weight, rawValue)
{
  if ((typeof rawValue === 'string') && rawValue.endsWith(weight.value))
  {
    return +weight.weight;
  }

  return 0;
}

/**
 * Returns the weight if rawValue is a string that ends
 * with weight.value
 */
function weightNotEndsWith(weight, rawValue)
{
  if ((typeof rawValue === 'string') && rawValue.endsWith(weight.value))
  {
    return 0;
  }

  return +weight.weight;
}

function weightEquals(weight, rawValue)
{
  if (weight.value === rawValue)
  {
    return +weight.weight;
  }

  return 0;
}

function weightIsNull(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return +weight.weight;
  }

  return 0;
}

function weightIsNotNull(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return 0;
  }

  return +weight.weight;
}

function weightIsMobile(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return 0;
  }

  if (rawValue.startsWith('+614'))
  {
    return +weight.weight;
  }

  return 0;
}

/**
 * Returns the weight if this is undefined, null, an empty array or string
 */
function weightIsEmpty(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return +weight.weight;
  }

  if (Array.isArray(rawValue) && rawValue.length === 0)
  {
    return +weight.weight;
  }

  if (rawValue === '')
  {
    return +weight.weight;
  }

  return 0;
}

function weightIsNotMobile(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return +weight.weight;
  }

  if (!rawValue.startsWith('+614'))
  {
    return +weight.weight;
  }

  return 0;
}

function weightLessThan(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return 0;
  }

  if (commonUtils.isNumber(rawValue) && commonUtils.isNumber(weight.value))
  {
    if (+rawValue < +weight.value)
    {
      return +weight.weight;
    }
  }
  else
  {
    if (rawValue < weight.value)
    {
      return weight.weight;
    }
  }

  return 0;
}

function weightGreaterThan(weight, rawValue)
{
  if (rawValue === undefined || rawValue === null)
  {
    return 0;
  }

  if (commonUtils.isNumber(rawValue) && commonUtils.isNumber(weight.value))
  {
    if (+rawValue > +weight.value)
    {
      return +weight.weight;
    }
  }
  else
  {
    if (rawValue > weight.value)
    {
      return weight.weight;
    }
  }

  return 0;
}
