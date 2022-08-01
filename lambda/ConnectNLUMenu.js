var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

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

    // Grab the contact id from the event
    var contactId = event.Details.ContactData.InitialContactId;

    // Load the current customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Fetch all config items and load them into the top level of the customer state
    await configUtils.checkLastChange(process.env.CONFIG_TABLE);
    var configItems = await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    var configKeys = Object.keys(configItems);

    configKeys.forEach(key => {
      customerState[key] = configItems[key];
    });

    // Fetches the selected intent
    var selectedIntent = event.Details.Parameters.selectedIntent;

    console.log('[INFO] found selected intent: ' + selectedIntent);

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
      throw new Error('Failed to locate yes no bot: ' + yesNoBotName);
    }

    const stateKeystoSave = [
      'CurrentRule_selectedIntent',
      'CurrentRule_selectedRuleSet',
      'CurrentRule_confirmationMessage',
      'CurrentRule_confirmationMessageType',
      'CurrentRule_confirmationMessagePromptArn',
      'CurrentRule_validIntent',
      'CurrentRule_yesNoBotArn'
    ];

    if (configuredRuleSet === undefined || intentConfirmationMessage === undefined)
    {
      console.log(`[ERROR] user selected an invalid intent: ${selectedIntent}`);

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
        When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ValidIntent: 'false',
        SelectedIntent: selectedIntent
      };
      console.log(JSON.stringify(logPayload, null, 2));

      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, stateKeystoSave);
      return requestUtils.buildCustomerStateResponse(customerState);
    }
    else
    {
      console.log(`[INFO] user selected a valid intent: ${selectedIntent} mapped to rule set: ${configuredRuleSet} with confirmation message: ${intentConfirmationMessage}`);

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
        When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ValidIntent: 'true',
        SelectedIntent: selectedIntent
      };
      console.log(JSON.stringify(logPayload, null, 2));

      await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, stateKeystoSave);
      return requestUtils.buildCustomerStateResponse(customerState);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to process NLU input', error);
    throw error;
  }
};

