// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const AWS = require('aws-sdk');
AWS.config.update({region: process.env.REGION});

const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const backoffUtils = require('./BackoffUtils');
const lambdaUtils = require('./LambdaUtils');
const lexUtils = require('./LexUtils');
const handlebarsUtils = require('./HandlebarsUtils');
const configUtils = require('./ConfigUtils');
const commonUtils = require('./CommonUtils');
const dynamoUtils = require('./DynamoUtils');
const operatingHoursUtils = require('./OperatingHoursUtils');
const connect = new AWS.Connect();

/**
 * The available action types backed by contact flows
 */
module.exports.actionTypes = [
  'DTMFInput',
  'DTMFMenu',
  'ExternalNumber',
  'Integration',
  'Message',
  'NLUInput',
  'NLUMenu',
  'Queue',
  'RuleSet',
  'SMSMessage',
  'Terminate',
  'Wait'
];

/**
 * Contact flows not backed by actions
 */
module.exports.nonActionTypes = [
  'Main',
  'Disconnect',
  'Error',
  'Bootstrap',
  'AgentWhisper',
  'CustomerHold',
  'CustomerQueue',
  'CustomerWhisper',
  'OutboundWhisper'
];

/**
 *  Actions not backed by connect flows
 */
module.exports.nonConnectActionTypes = [
  'Distribution',
  'Metric',
  'UpdateStates',
  'SetAttributes',
  'TextInference'
];

/**
 * Caches all connect data into config table
 */
module.exports.cacheConnectData = async function(stage, service,
    region, accountNumber, instanceId,
    botAlias, botLocale,
    configTable)
{
  try
  {
    // Cache hours of operations
    var operatingHours = await module.exports.getHoursOfOperations(instanceId);
    var operatingHoursData = [];

    operatingHours.forEach(hours => {
      operatingHoursData.push({
        Name: hours.Name,
        Description: hours.Description,
        Id: hours.HoursOfOperationId,
        Arn: hours.HoursOfOperationArn,
        Timezone: hours.TimeZone,
        Config: hours.Config
      });
    });

    var operatingHoursJSON = JSON.stringify(operatingHoursData);
    await dynamoUtils.updateConfigItem(configTable, 'OperatingHours', operatingHoursJSON);

    // Cache queues
    var queues = await module.exports.describeQueues(instanceId);
    var queueData = [];

    queues.forEach(queue => {
      queueData.push({
        Name: queue.Name,
        Description: queue.Description,
        Id: queue.QueueId,
        Arn: queue.QueueArn,
        OutboundCallerConfig: queue.OutboundCallerConfig,
        MaxContacts: queue.MaxContacts,
        Status: queue.Status,
        HoursOfOperationId: queue.HoursOfOperationId
      });
    });

    var queueJSON = JSON.stringify(queueData);
    await dynamoUtils.updateConfigItem(configTable, 'Queues', queueJSON);

    // Cache routing profiles
    var routingProfiles = await module.exports.describeRoutingProfiles(instanceId);
    var routingProfileJSON = JSON.stringify(routingProfiles);
    await dynamoUtils.updateConfigItem(configTable, 'RoutingProfiles', routingProfileJSON);

    // Cache contact flows
    var contactFlows = await module.exports.listContactFlows(instanceId);
    var contactFlowArns = [];
    contactFlows.forEach(contactFlow => {
      contactFlowArns.push({
        Name: contactFlow.Name,
        Id: contactFlow.Id,
        Arn: contactFlow.Arn,
        Type: contactFlow.ContactFlowType,
        State: contactFlow.ContactFlowState
      });
    });
    var contactFlowsData = JSON.stringify(contactFlowArns);
    await dynamoUtils.updateConfigItem(configTable, 'ContactFlows', contactFlowsData);

    // Cache prompts
    var prompts = await module.exports.listPrompts(instanceId);
    var promptArns = [];
    prompts.forEach(prompt => {
      promptArns.push({
        Name: prompt.Name,
        Id: prompt.Id,
        Arn: prompt.Arn
      });
    });
    var promptData = JSON.stringify(promptArns);
    await dynamoUtils.updateConfigItem(configTable, 'Prompts', promptData);

    // Cache phone numbers
    var phoneNumbers = await module.exports.listPhoneNumbers(instanceId);
    var phoneNumbersArray = [];
    phoneNumbers.forEach(phoneNumber => {
      phoneNumbersArray.push({
        PhoneNumber: phoneNumber.PhoneNumber,
        Id: phoneNumber.Id,
        Arn: phoneNumber.Arn,
        CountryCode: phoneNumber.PhoneNumberCountryCode,
        Type: phoneNumber.PhoneNumberType
      });
    });
    var phoneNumberData = JSON.stringify(phoneNumbersArray);
    await dynamoUtils.updateConfigItem(configTable, 'PhoneNumbers', phoneNumberData);

    // Cache lambda functions
    var lambdaFunctions = await lambdaUtils.listConnectLambdaFunctions(process.env.STAGE, process.env.SERVICE);
    var lambdaFunctionArns = [];
    lambdaFunctions.forEach(lambdaFunction => {
      lambdaFunctionArns.push({
        Name: lambdaFunction.FunctionName,
        Arn: lambdaFunction.FunctionArn
      });
    });
    var lambdaFunctionsData = JSON.stringify(lambdaFunctionArns);
    await dynamoUtils.updateConfigItem(configTable, 'LambdaFunctions', lambdaFunctionsData);

    var lexPrefix = `${stage}-${service}-`;

    // Cache LexV2 bots
    var lexBots = await lexUtils.listLexBots(stage, service);
    var lexBotData = [];
    for (var i = 0; i < lexBots.length; i++)
    {
      var description = await lexUtils.describeLexBot(stage, service, region, accountNumber, lexBots[i].botName, botLocale, botAlias);
      lexBotData.push(description);
    }
    await dynamoUtils.updateConfigItem(configTable, 'LexBots', JSON.stringify(lexBotData));

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(configTable);
  }
  catch (error)
  {
    console.log('[ERROR] failed to cache Connect data', error);
    throw error;
  }
}

/**
 * Fetches contact attributes from Connect with an initial contact id
 * with retry and jittered backoff
 */
module.exports.getContactAttributes = async function(instanceId, initialContactId)
{
  var maxRetries = 20;
  var retry = 0;
  var lastFailure = undefined;

  var request = {
    InstanceId: instanceId,
    InitialContactId: initialContactId
  };

  while (retry < maxRetries)
  {
    try
    {
      var getAttributesResponse = await connect.getContactAttributes(request).promise();
      var attributes = getAttributesResponse.Attributes;

      if (attributes === undefined || attributes === null)
      {
        attributes = {};
      }
      return attributes;
    }
    catch (error)
    {
      lastFailure = error;
      await backoffUtils.backoff(`Connect.getContactAttributes(initialContactId: ${initialContactId})`, retry, error);
      retry++;
    }
  }

  console.error(`Failed to load contact attributes for initial contact id: [${initialContactId}] max retries exceeded`, lastFailure);
  throw new Error(`Failed to load contact attributes for initial contact id: [${initialContactId}] max retries exceeded`, lastFailure);
}

/**
 * Updates contact attributes in Connect with retry and jittered backoff
 */
module.exports.updateContactAttributes = async function(instanceId, initialContactId, attributes)
{
  var maxRetries = 20;
  var retry = 0;
  var lastFailure = undefined;

  var request = {
    InstanceId: instanceId,
    InitialContactId: initialContactId,
    Attributes: attributes
  };

  while (retry < maxRetries)
  {
    try
    {
      await connect.updateContactAttributes(request).promise();
      console.info(`Successfully updated contact attributes for initial contact id: [${initialContactId}]`);
      return;
    }
    catch (error)
    {
      lastFailure = error;
      await backoffUtils.backoff(`Connect.updateContactAttributes(initialContactId: ${initialContactId})`, retry, error);
      retry++;
    }
  }

  console.error(`Failed to update attributes for initial contact id: [${initialContactId}] max retries exceeded`, lastFailure);
  throw new Error(`Failed to update contact attributes for initial contact id: [${initialContactId}] max retries exceeded`, lastFailure);
}

/**
 * Loads a list of queues
 */
module.exports.listQueues = async function(instanceId)
{
  try
  {
    var queues = [];

    var params = {
      InstanceId: instanceId,
      QueueTypes: ['STANDARD']
    };

    var results = await connect.listQueues(params).promise();
    queues = queues.concat(results.QueueSummaryList);

    while (results.NextToken)
    {
      await commonUtils.sleep(500);
      params.NextToken = results.NextToken;
      results = await connect.listQueues(params).promise();
      queues = queues.concat(results.QueueSummaryList);
    }

    queues.sort(function (a, b) {
      return a.Name.toLowerCase().localeCompare(b.Name.toLowerCase());
    });

    return queues;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list queues', error);
    throw error;
  }
}

/**
 * Loads a list of routing profiles
 */
module.exports.listRoutingProfiles = async function(instanceId)
{
  try
  {
    var routingProfiles = [];

    var params = {
      InstanceId: instanceId
    };

    var results = await connect.listRoutingProfiles(params).promise();
    routingProfiles = routingProfiles.concat(results.RoutingProfileSummaryList);

    while (results.NextToken)
    {
      await commonUtils.sleep(500);
      params.NextToken = results.NextToken;
      results = await connect.listRoutingProfiles(params).promise();
      routingProfiles = routingProfiles.concat(results.RoutingProfileSummaryList);
    }

    routingProfiles.sort(function (a, b) {
      return a.Name.toLowerCase().localeCompare(b.Name.toLowerCase());
    });

    var final = [];

    routingProfiles.forEach(rp => {
      final.push({
        Name: rp.Name,
        Id: rp.Id,
        Arn: rp.Arn
      });
    });

    return final;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list all routing profiles', error);
    throw error;
  }
};

/**
 * Describes all routing profiles and their associated queues
 */
module.exports.describeRoutingProfiles = async function(instanceId)
{
  try
  {
    var routingProfileList = await module.exports.listRoutingProfiles(instanceId);

    for (var i = 0; i < routingProfileList.length; i++)
    {
      var params =
      {
        InstanceId: instanceId,
        RoutingProfileId: routingProfileList[i].Id
      };

      routingProfileList[i].Queues = [];

      var results = await connect.listRoutingProfileQueues(params).promise();

      results.RoutingProfileQueueConfigSummaryList.forEach(queue =>
      {
        routingProfileList[i].Queues.push(queue);
      });

      while (results.NextToken)
      {
        await commonUtils.sleep(500);
        params.NextToken = results.NextToken;
        results = await connect.listRoutingProfileQueues(params).promise();
        results.RoutingProfileQueueConfigSummaryList.forEach(queue =>
        {
          routingProfileList[i].Queues.push(queue);
        });
      }

      await commonUtils.sleep(500);
    }

    return routingProfileList;
  }
  catch (error)
  {
    console.log('[ERROR] failed to describe all routing profiles', error);
    throw error;
  }

}

/**
 * Describes all standard queues
 */
module.exports.describeQueues = async function(instanceId)
{
  try
  {
    var queueList = await module.exports.listQueues(instanceId);

    var queues = [];

    for (var i = 0; i < queueList.length; i++)
    {
      var params =
      {
        InstanceId: instanceId,
        QueueId: queueList[i].Id
      };

      await commonUtils.sleep(500);
      var queueDescription = await connect.describeQueue(params).promise();
      queues.push(queueDescription.Queue);
    }

    return queues;
  }
  catch (error)
  {
    console.log('[ERROR] failed to describe all queues', error);
    throw error;
  }
};

/**
 * Loads a list of contact flows
 */
module.exports.listPhoneNumbers = async function(instanceId)
{
  try
  {
    var phoneNumbers = [];

    var params = {
      InstanceId: instanceId
    };

    var results = await connect.listPhoneNumbers(params).promise();
    phoneNumbers = phoneNumbers.concat(results.PhoneNumberSummaryList);

    while (results.NextToken)
    {
      await commonUtils.sleep(500);
      params.NextToken = results.NextToken;
      results = await connect.listPhoneNumbers(params).promise();
      phoneNumbers = phoneNumbers.concat(results.PhoneNumberSummaryList);
    }

    phoneNumbers.sort(function (a, b) {
      return a.PhoneNumber.localeCompare(b.PhoneNumber);
    });

    return phoneNumbers;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list phone numbers', error);
    throw error;
  }
};

/**
 * Loads a list of installed prompts
 */
module.exports.listPrompts = async function(instanceId)
{
  try
  {
    var prompts = [];

    var params = {
      InstanceId: instanceId
    };

    var results = await connect.listPrompts(params).promise();
    prompts = prompts.concat(results.PromptSummaryList);

    while (results.NextToken)
    {
      await commonUtils.sleep(500);
      params.NextToken = results.NextToken;
      results = await connect.listPrompts(params).promise();
      prompts = prompts.concat(results.PromptSummaryList);
    }

    prompts.sort(function (a, b) {
      return a.Name.localeCompare(b.Name);
    });

    return prompts;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list prompts', error);
    throw error;
  }
};

/**
 * Loads a list of contact flows
 */
module.exports.listContactFlows = async function(instanceId)
{
  try
  {
    var contactFlows = [];

    var params = {
      InstanceId: instanceId,
      ContactFlowTypes: ['CONTACT_FLOW', 'AGENT_WHISPER', 'CUSTOMER_HOLD', 'OUTBOUND_WHISPER', 'CUSTOMER_WHISPER', 'CUSTOMER_QUEUE']
    };

    var results = await connect.listContactFlows(params).promise();
    contactFlows = contactFlows.concat(results.ContactFlowSummaryList);

    while (results.NextToken)
    {
      await commonUtils.sleep(500);
      params.NextToken = results.NextToken;
      results = await connect.listContactFlows(params).promise();
      contactFlows = contactFlows.concat(results.ContactFlowSummaryList);
    }

    contactFlows.sort(function (a, b) {
      return a.Name.toLowerCase().localeCompare(b.Name.toLowerCase());
    });

    return contactFlows;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list contact flows', error);
    throw error;
  }
};

/**
 * Starts an outbound call and returns the contact id
 */
module.exports.intiateOutboundCall = async function(
  instanceId,
  contactFlowId,
  sourcePhone,
  phoneNumber)
{
  try
  {
    console.log('[INFO] Initiating outbound call');

    var params = {
      DestinationPhoneNumber: phoneNumber,
      InstanceId: instanceId,
      Attributes:
      {
      },
      SourcePhoneNumber: sourcePhone,
      ContactFlowId: contactFlowId
    };

    console.log('[INFO] about to make outbound call: ' + JSON.stringify(params, null, '  '));

    var response = await connect.startOutboundVoiceContact(params).promise();

    console.log('[INFO] Outbound call initiated: ' + JSON.stringify(response, null, 2));

    return response.ContactId;
  }
  catch (error)
  {
    console.log('[ERROR] failed to initiate outbound call', error);
    throw error;
  }
};

/**
 * Creates an empty contact flow
 */
module.exports.createContactFlow = async function (instanceId, flowName, flowContent, flowType)
{
  try
  {
    var request = {
      Content: flowContent,
      InstanceId: instanceId,
      Name: flowName,
      Type: flowType,
      Description: 'Rules engine managed contact flow'
    };

    console.log('[INFO] about to create contact flow with request: ' + JSON.stringify(request, null, 2));

    var response = await connect.createContactFlow(request).promise();

    console.log('[INFO] got create contact flow response: ' + JSON.stringify(response, null, 2));

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to create contact flow', error);
    throw error;
  }
};

/**
 * Describes a contact flow
 */
module.exports.describeContactFlow = async function (instanceId, contactFlowId)
{
  try
  {
    var request = {
      InstanceId: instanceId,
      ContactFlowId: contactFlowId
    };

    var response = await connect.describeContactFlow(request).promise();

    return response.ContactFlow;
  }
  catch (error)
  {
    console.log('[ERROR] failed to describe contact flow: ' + contactFlowId, error);
    throw error;
  }
};

/**
 * Updates the content of a specific contact flow
 */
module.exports.updateContactFlowContent = async function (instanceId, contactFlowId, flowContent)
{
  try
  {
    var request = {
      Content: flowContent,
      InstanceId: instanceId,
      ContactFlowId: contactFlowId
    };

    console.log('[INFO] about to update contact flow with request: ' + JSON.stringify(request, null, 2));

    var response = await connect.updateContactFlowContent(request).promise();

    console.log('[INFO] got update contact flow content response: ' + JSON.stringify(response, null, 2));

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to update contact flow content', error);
    throw error;
  }
};

/**
 * Loads a templated contact flow from the deployed package
 */
module.exports.loadContactFlowTemplate = function (flowName)
{
  var resolved = path.resolve(process.env.LAMBDA_TASK_ROOT, 'connect/contactflows/' + flowName + '.json');

  try
  {
    return fs.readFileSync(resolved, 'utf8');
  }
  catch (error)
  {
    console.log('[ERROR] failed to load contact flow from template: ' + resolved, error);
    throw error;
  }
};

/**
 * Get a map of contact flow names against ARNs and Ids
 */
module.exports.getContactFlowsMap = function (contactFlows)
{
  var results = {};

  contactFlows.forEach(contactFlow => {
    results[contactFlow.Name] = {
      arn: contactFlow.Arn,
      id: contactFlow.Id
    };
  });

  return results;
};

/**
 * Get a map of prompt names against ARNs and Ids
 */
module.exports.getPromptsMap = function (prompts)
{
  var results = {};

  prompts.forEach(prompt => {

    var cleanName = prompt.Name.replace(/[^0-9A-Za-z]/g, '_');

    results[cleanName] = {
      arn: prompt.Arn,
      id: prompt.Id
    };
  });

  return results;
};

/**
 * Checks to see if all contact flows have been installed correctly
 */
module.exports.checkContactFlowStatus = async function (instanceId, stage, service, configItems)
{
  try
  {
    var response = {
      status: 'UNKNOWN',
      contactFlows: []
    };

    var contactFlows = configItems.ContactFlows;
    var prompts = configItems.Prompts;
    var lambdaFunctions = configItems.LambdaFunctions;

    var unhealthyFlows = 0;

    var lambdaFunctionsMap = lambdaUtils.getConnectLambdaFunctionMap(stage, service, lambdaFunctions);
    var contactFlowsMap = module.exports.getContactFlowsMap(contactFlows);
    var promptsMap = module.exports.getPromptsMap(prompts);

    var connectParams = {
      lambdaFunctions: lambdaFunctionsMap,
      contactFlows: contactFlowsMap,
      prompts: promptsMap
    };

    // Inject in the sequence shift lambda arn if available
    var sequenceShiftLambda = configItems.SequenceShiftLambdaArn;

    if (sequenceShiftLambda !== undefined)
    {
      connectParams.lambdaFunctions.sequenceshift = {
        arn: sequenceShiftLambda.configData
      };
    }

    // Merge the action and non-action types
    var allActions = module.exports.actionTypes.concat(module.exports.nonActionTypes);

    /**
     * Walk each contact flow, checking it exists
     * and checking it's content if exists
     */
    for (var i = 0; i < allActions.length; i++)
    {
      var actionType = allActions[i];
      var contactFlowName = 'RulesEngine' + actionType;

      var existingFlow = contactFlows.find(contactFlow => contactFlow.Name === contactFlowName);

      if (existingFlow !== undefined)
      {
        await commonUtils.sleep(500);
        var contactFlowDescription = await module.exports.describeContactFlow(instanceId, existingFlow.Id);
        var contactFlowTemplate = module.exports.loadContactFlowTemplate(contactFlowName);
        var expectedContent = handlebarsUtils.template(contactFlowTemplate, connectParams);

        if (contactFlowDescription.Content === expectedContent)
        {
          response.contactFlows.push({
            name: contactFlowName,
            arn: existingFlow.Arn,
            id: existingFlow.Id,
            status: 'HEALTHY'
          });
        }
        else
        {
          response.contactFlows.push({
            name: contactFlowName,
            arn: existingFlow.Arn,
            id: existingFlow.Id,
            status: 'UNHEALTHY'
          });
          unhealthyFlows++;
        }
      }
      else
      {
        response.contactFlows.push({
          name: contactFlowName,
          status: 'MISSING'
        });
        unhealthyFlows++;
      }
    }

    if (unhealthyFlows === 0)
    {
      response.status = 'HEALTHY';
    }
    else
    {
      response.status = 'UNHEALTHY';
    }

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to determine health of contact flows', error);
    throw error;
  }
};

/**
 * Fetch the time of day
 */
module.exports.getTimeOfDay = function(localHour)
{
  if (localHour < 12)
  {
    return 'morning';
  }
  else if (localHour >= 12 && localHour < 18)
  {
    return 'afternoon';
  }
  else
  {
    return 'evening';
  }
}

/**
 * Loads hours of operations so these can be evaluated
 */
module.exports.getHoursOfOperations = async function (instanceId)
{
  try
  {
    var listRequest = {
      InstanceId: instanceId
    };

    var operatingHours = [];

    // Load the list of working hours
    var listResponse = await connect.listHoursOfOperations(listRequest).promise();

    operatingHours = operatingHours.concat(listResponse.HoursOfOperationSummaryList);

    while (listResponse.NextToken)
    {
      await commonUtils.sleep(500);
      listRequest.NextToken = listResponse.NextToken;
      listResponse = await connect.listHoursOfOperations(listRequest).promise();
      operatingHours = operatingHours.concat(listResponse.HoursOfOperationSummaryList);
    }

    operatingHours.sort(function (a, b) {
      return a.Name.localeCompare(b.Name);
    });

    var hoursOfOperations = [];

    // Describe each working hours
    for (var i = 0; i < operatingHours.length; i++)
    {
      var operatingHoursItem = operatingHours[i];

      var describeRequest = {
        InstanceId: instanceId,
        HoursOfOperationId: operatingHoursItem.Id
      };

      console.log('[INFO] describing hours: ' + operatingHoursItem.Name);

      // Back off to avoid throttling
      await commonUtils.sleep(500);
      var describeResponse = await connect.describeHoursOfOperation(describeRequest).promise();
      hoursOfOperations.push(describeResponse.HoursOfOperation);
    }

    hoursOfOperations.sort(function (a, b) {
      return a.Name.localeCompare(b.Name);
    });

    return hoursOfOperations;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load operating hours', error);
    throw error;
  }
};

/**
 * Computes attributes that are missing or changed from what is in connect and what
 * we see in the state at the end of the call.
 */
module.exports.computeAttributesDelta = (connectAttributes, stateAttributes) =>
{
  if (connectAttributes === undefined)
  {
    connectAttributes = {};
  }

  var delta = [];

  if (stateAttributes === undefined)
  {
    stateAttributes = {};
  }

  Object.keys(stateAttributes).forEach(key =>
  {
    var stateValue = stateAttributes[key];
    var connectValue = connectAttributes[key];

    if (stateValue !== connectValue)
    {
      delta.push({
        key: key,
        value: stateValue
      });
    }

  });

  return delta;
}

function sortObjectFields(toSort)
{
  var result = {};

  var fields = Object.keys(toSort);
  fields.sort();

  fields.forEach(field => {
    result[field] = toSort[field];
  });

  return result;
}
