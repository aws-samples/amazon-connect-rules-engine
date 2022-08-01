var AWS = require('aws-sdk');
var fs = require('fs');


/**
 * Lists prompts
 */
async function listPrompts(instanceId, region)
{
  try
  {

    AWS.config.update({region: region});
    var connect = new AWS.Connect();

    var prompts = [];

    var params = {
      InstanceId: instanceId
    };

    var results = await connect.listPrompts(params).promise();
    console.info('Response: ' + JSON.stringify(results, null, 2));
    prompts = prompts.concat(results.PromptSummaryList);

    while (results.NextToken)
    {
      params.NextToken = results.NextToken;
      results = await connect.listPrompts(params).promise();
      prompts = prompts.concat(results.PromptSummaryList);
    }

    prompts.sort(function (a, b) {
      return a.Name.toLowerCase().localeCompare(b.Name.toLowerCase());
    });

    return prompts;
  }
  catch (error)
  {
    console.error('Failed to list prompts', error);
    throw error;
  }
};

/**
 * List contact flows
 */
async function listContactFlows(instanceId, region)
{
  try
  {

    AWS.config.update({region: region});
    var connect = new AWS.Connect();

    var contactFlows = [];

    var params = {
      InstanceId: instanceId,
      ContactFlowTypes: ['CONTACT_FLOW', 'AGENT_WHISPER', 'CUSTOMER_HOLD', 'OUTBOUND_WHISPER', 'CUSTOMER_WHISPER', 'CUSTOMER_QUEUE']
    };

    var results = await connect.listContactFlows(params).promise();
    contactFlows = contactFlows.concat(results.ContactFlowSummaryList);

    while (results.NextToken)
    {
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
 * Is this a connect Lambda function
 */
function isConnectFunction(stage, service, functionName)
{
  var prefix1 = `${stage}-${service}-connect`;
  var prefix2 = `${stage}-${service}-integration`;
  return functionName.startsWith(prefix1) || functionName.startsWith(prefix2);
}

/**
 * Lists the connect and integration Lambda functions in this
 * account for the requested stage and service
 */
async function listConnectLambdaFunctions(stage, service, region)
{
  try
  {
    console.log('[INFO] loading Connect Lambda functions');

    AWS.config.update({region: region});
    var lambda = new AWS.Lambda();

    var functions = [];
    var request = {};

    var results = await lambda.listFunctions(request).promise();

    functions = functions.concat(results.Functions.filter(lambdaFunction => isConnectFunction(stage, service, lambdaFunction.FunctionName)));

    while (results.NextMarker)
    {
      request.Marker = results.NextMarker;
      results = await lambda.listFunctions(request).promise();
      functions = functions.concat(results.Functions.filter(lambdaFunction => isConnectFunction(stage, service, lambdaFunction.FunctionName)));
    }

    functions.sort(function (a, b) {
      return a.FunctionName.toLowerCase().localeCompare(b.FunctionName.toLowerCase());
    });

    console.log(`[INFO] loaded: ${functions.length} filtered Lambda functions`);

    return functions;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list filtered functions for account', error);
    throw error;
  }
}


/**
 * Create fixes that attempts to replace Lambda
 * and contact flow arns with templates
 */
async function prepareFixes(fileName)
{
  var fixes = [];

  try
  {
    var contactFlows = await listContactFlows(process.env.instanceId, process.env.region);

    contactFlows.forEach(contactFlow => {
      fixes.push({
        original: contactFlow.Arn,
        replacement: `{{contactFlows.${contactFlow.Name}.arn}}`
      });
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to populate contact flows into fixes', error);
    throw error;
  }

  try
  {
    var prompts = await listPrompts(process.env.instanceId, process.env.region);

    console.info('Loaded prompts: ' + JSON.stringify(prompts, null, 2));

    prompts.forEach(prompt => {

      var cleanName = prompt.Name.replace(/[^0-9A-Za-z]/g, '_');

      fixes.push({
        original: prompt.Arn,
        replacement: `{{prompts.${cleanName}.arn}}`
      });
    });
  }
  catch (error)
  {
    console.error('Failed to populate prompts into fixes', error);
    throw error;
  }

  try
  {
    var lambdaFunctions = await listConnectLambdaFunctions(process.env.stage, process.env.service, process.env.region);

    var prefix = `${process.env.stage}-${process.env.service}-`;

    lambdaFunctions.forEach(lambdaFunction => {

      var functionName = lambdaFunction.FunctionName;

      functionName = functionName.substring(prefix.length);

      fixes.push({
        original: lambdaFunction.FunctionArn,
        replacement: `{{lambdaFunctions.${functionName}.arn}}`
      });
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to populate lambda functions into fixes', error);
    throw error;
  }

  var fixJson = JSON.stringify(fixes, null, 2);
  console.log('[INFO] prepared contact flow fix data: ' + fixJson);

  fs.writeFileSync(fileName, fixJson);
}

async function makeFixes()
{
  await prepareFixes(process.argv[2]);
}

makeFixes();
