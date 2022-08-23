// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const requestUtils = require('./utils/RequestUtils');
const dynamoUtils = require('./utils/DynamoUtils');
const configUtils = require('./utils/ConfigUtils');
const keepWarmUtils = require('./utils/KeepWarmUtils');
const commonUtils = require('./utils/CommonUtils');

// TODO Refactor logic from contact flow here
// TODO Add configurable retries
// TODO Port to InferenceUtils.updateState
// TODO add auto confirm based on intent confidence

var moment = require('moment-timezone');

/**
 * Handles processing the NLU menu selection returning the next rule set
 * on success or an error flag if an invalid intent was detected.
 * This function outputs the arn for the yes no lex bot.
 * It relies on inferencing to have resolved prompt arns.
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);

    // Check for warm up message and bail out after cache loads
    if (keepWarmUtils.isKeepWarmRequest(event))
    {
      return await keepWarmUtils.makeKeepWarmResponse(event, 0);
    }

    var stateToSave = new Set();

    // Grab the contact id from the event
    var contactId = event.Details.ContactData.InitialContactId;

    // Load the current customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Check for config refresh
    await configUtils.checkLastChange(process.env.CONFIG_TABLE);

    // Pretty sure we don't need the whole config loaded into the customer state

    // Fetches the selected intent
    var selectedIntent = event.Details.Parameters.selectedIntent;

    customerState.System.LastNLUMenuIntent = selectedIntent;
    stateToSave.add('System');

    console.info(`${contactId} found selected intent: ${selectedIntent}`);

    var configuredRuleSet = customerState['CurrentRule_intentRuleSet_' + selectedIntent];
    var intentConfirmationMessage = customerState['CurrentRule_intentConfirmationMessage_' + selectedIntent];
    var intentConfirmationMessageType = customerState['CurrentRule_intentConfirmationMessage_' + selectedIntent + 'Type'];

    // May be undefined if not a prompt
    var intentConfirmationMessagePromptArn = customerState['CurrentRule_intentConfirmationMessage_' + selectedIntent + 'PromptArn'];

    var yesNoBotName = `${process.env.STAGE}-${process.env.SERVICE}-yesno`;

    var lexBots = await configUtils.getLexBots(process.env.CONFIG_TABLE);

    var yesNoBot = lexBots.find((lexBot) => lexBot.Name === yesNoBotName);

    if (yesNoBot === undefined)
    {
      throw new Error(`${contactId} failed to locate yes no bot: ${yesNoBotName}`);
    }

    stateToSave.add('CurrentRule_selectedIntent');
    stateToSave.add('CurrentRule_selectedRuleSet');
    stateToSave.add('CurrentRule_confirmationMessage');
    stateToSave.add('CurrentRule_confirmationMessageType');
    stateToSave.add('CurrentRule_confirmationMessagePromptArn');
    stateToSave.add('CurrentRule_validIntent');
    stateToSave.add('CurrentRule_yesNoBotArn');

    if (configuredRuleSet === undefined || intentConfirmationMessage === undefined)
    {
      console.error(`${contactId} user selected an invalid intent: ${selectedIntent}`);

      customerState.CurrentRule_selectedIntent = undefined;
      customerState.CurrentRule_selectedRuleSet = undefined;
      customerState.CurrentRule_confirmationMessage = undefined;
      customerState.CurrentRule_confirmationMessageType = undefined;
      customerState.CurrentRule_confirmationMessagePromptArn = undefined;
      customerState.CurrentRule_validIntent = 'false';
      customerState.CurrentRule_yesNoBotArn = yesNoBot.Arn;

      // Log a payload to advise the status of this menu
      var logPayload = {
        EventType: 'ANALYTICS',
        EventCode: 'NLU_MENU_SELECTION',
        ContactId: contactId,
        RuleSet: customerState.CurrentRuleSet,
        Rule: customerState.CurrentRule,
        When: commonUtils.nowUTCMillis(),
        ValidIntent: 'false',
        SelectedIntent: selectedIntent
      };
      console.log(JSON.stringify(logPayload, null, 2));

      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
      return requestUtils.buildCustomerStateResponse(customerState);
    }
    else
    {
      console.info(`${contactId} user selected a valid intent: ${selectedIntent} mapped to rule set: ${configuredRuleSet} with confirmation message: ${intentConfirmationMessage}`);

      customerState.CurrentRule_selectedIntent = selectedIntent;
      customerState.CurrentRule_selectedRuleSet = configuredRuleSet;
      customerState.CurrentRule_confirmationMessage = intentConfirmationMessage;
      customerState.CurrentRule_confirmationMessageType = intentConfirmationMessageType;
      customerState.CurrentRule_confirmationMessagePromptArn = intentConfirmationMessagePromptArn;
      customerState.CurrentRule_validIntent = 'true';
      customerState.CurrentRule_yesNoBotArn = yesNoBot.Arn;

      // Log a payload to advise the status of this menu
      var logPayload = {
        EventType: 'ANALYTICS',
        EventCode: 'NLU_MENU_SELECTION',
        ContactId: contactId,
        RuleSet: customerState.CurrentRuleSet,
        Rule: customerState.CurrentRule,
        NextRuleSet: configuredRuleSet,
        When: commonUtils.nowUTCMillis(),
        ValidIntent: 'true',
        SelectedIntent: selectedIntent
      };
      console.log(JSON.stringify(logPayload, null, 2));

      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
      return requestUtils.buildCustomerStateResponse(customerState);
    }
  }
  catch (error)
  {
    console.error('Failed to process NLU input', error);
    throw error;
  }
};

