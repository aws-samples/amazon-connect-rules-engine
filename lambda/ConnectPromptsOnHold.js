var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Handles processing prompts on hold which just loops through a
 * list of prompts and plays them one by one, repeating the last prompt.
 *
 * This function finds the next prompt and exports it's arn into:
 *
 *    customerState.CurrentRule_currentPromptArn
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

    // Load cached prompts
    var prompts = configItems.Prompts;

    // Find out all of the prompts we will be playing
    var promptNamesString = customerState.CurrentRule_onHoldPromptNames;

    // Split into lines and trim each line
    var promptNames = promptNamesString.split(/\n/);

    // Find all prompts that exist
    var validPrompts = [];
    for (var i = 0; i < promptNames.length; i++)
    {
      var cleanName = promptNames[i].trim();

      if (cleanName !== '')
      {
        var prompt = prompts.find(p => p.Name === cleanName);

        if (prompt !== undefined)
        {
          validPrompts.push(prompt);
        }
        else
        {
          console.log('[WARNING] skipping missing prompt: ' + cleanName);
        }
      }
    }

    console.log('Got valid prompts: ' + JSON.stringify(validPrompts, null, 2));

    // Increment out current prompt index (starts at -1)
    var currentIndex = +customerState.CurrentRule_currentIndex + 1;

    // Clamp at the last prompt
    if (currentIndex > validPrompts.length - 1)
    {
      currentIndex = validPrompts.length - 1;
    }

    console.log('[INFO] got currentIndex: ' + currentIndex);

    var selectedPrompt = validPrompts[currentIndex];

    console.log('[INFO] found selected prompt: ' + JSON.stringify(selectedPrompt, null, 2));

    // Export the selected prompt, index and arn
    customerState.CurrentRule_currentPromptName = selectedPrompt.Name;
    customerState.CurrentRule_currentPromptArn = selectedPrompt.Arn;
    customerState.CurrentRule_currentIndex = '' + currentIndex;

    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState,
      [
        'CurrentRule_currentPromptName',
        'CurrentRule_currentPromptArn',
        'CurrentRule_currentIndex'
      ]);

    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.log('[ERROR] failed to locate next prompt on hold', error);
    throw error;
  }
};
