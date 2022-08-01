// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');
var lambdaUtils = require('./utils/LambdaUtils.js');
var configUtils = require('./utils/ConfigUtils.js');
var handlebarsUtils = require('./utils/HandlebarsUtils.js');

/**
 * Updates the content for a contact flow
 * TODO this could depend on having up to date config data and not going back
 * to connect for listing of primary assets.
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var contactFlow = JSON.parse(event.body).contactFlow;

    await configUtils.checkLastChange(process.env.CONFIG_TABLE);
    var configItems = await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    var response = {
      success: true,
      updated: false,
      name: contactFlow.name
    };

    if (contactFlow.status === 'UNHEALTHY' || contactFlow.status === 'MISSING')
    {
      var lambdaFunctions = configItems.LambdaFunctions;
      var lambdaFunctionsMap = lambdaUtils.getConnectLambdaFunctionMap(process.env.STAGE, process.env.SERVICE, lambdaFunctions);
      var contactFlows = configItems.ContactFlows;
      var contactFlowsMap = connectUtils.getContactFlowsMap(contactFlows);
      var prompts = configItems.Prompts;
      var promptsMap = connectUtils.getPromptsMap(prompts);

      var contactFlowTemplate = connectUtils.loadContactFlowTemplate(contactFlow.name);

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

      console.log('[INFO] made connect params: ' + JSON.stringify(connectParams, null, 2));

      var contactFlowContent = handlebarsUtils.template(contactFlowTemplate, connectParams);

      var parsedContent = JSON.parse(contactFlowContent);

      console.log(`[INFO] about to update contact flow: ${contactFlow.name} using content:\n${JSON.stringify(parsedContent, null, 2)}`);
      await connectUtils.updateContactFlowContent(process.env.INSTANCE_ID, contactFlow.id, contactFlowContent);
      response.updated = true;
    }
    else
    {
      console.log('[INFO] skipping healthy contact flow: ' + contactFlow.name);
    }

    return requestUtils.buildSuccessfulResponse(response);
  }
  catch (error)
  {
    console.log('[ERROR] failed to update contact flow', error);
    return requestUtils.buildErrorResponse(error);
  }
};
