var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

var moment = require('moment-timezone');

/**
 * Handles processing the DTMF menu selection, now handles
 * more logic to simplify the contact flow
 */
exports.handler = async(event, context) =>
{
  var contactId = undefined;

  try
  {
    requestUtils.logRequest(event);

    // Grab the contact id from the event
    contactId = event.Details.ContactData.InitialContactId;

    // Load the current customer state
    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // State to save fields
    var stateToSave = new Set();

    var errorCount = 0;
    var inputCount = 3;

    if (isNumber(customerState.CurrentRule_errorCount))
    {
      errorCount = +customerState.CurrentRule_errorCount;
    }

    if (isNumber(customerState.CurrentRule_inputCount))
    {
      inputCount = +customerState.CurrentRule_inputCount;
    }

    // Fetches the selected option
    var selectedOption = event.Details.Parameters.selectedOption;

    console.info(`[INFO] ${contactId} found raw user input: ${selectedOption}`);

    if (selectedOption === '*')
    {
      selectedOption = 'Star';
    }

    if (selectedOption === '#')
    {
      selectedOption = 'Pound';
    }

    if (selectedOption === '+')
    {
      selectedOption = 'Plus';
    }

    console.info(`[INFO] ${contactId} found processed user input: ${selectedOption}`);

    var configuredOption = customerState['CurrentRule_dtmf' + selectedOption];

    // We found a valid selection!
    if (configuredOption !== undefined)
    {
      console.log(`[INFO] ${contactId} user selected a valid option: ${selectedOption} mapped to rule set: ${configuredOption}`);

      customerState.CurrentRule_validSelection = 'true';
      stateToSave.add('CurrentRule_validSelection');

      customerState.CurrentRule_failureReason = undefined;
      stateToSave.add('CurrentRule_failureReason');

      customerState.NextRuleSet = configuredOption;
      stateToSave.add('NextRuleSet');

      customerState.CurrentRule_done = 'true';
      stateToSave.add('CurrentRule_done');

      customerState.CurrentRule_terminate = 'false';
      stateToSave.add('CurrentRule_terminate');

      customerState.System.LastSelectedDTMF = selectedOption;
      stateToSave.add('System');

      // Log a payload to advise the status of this menu
      var logPayload = {
        EventType: 'ANALYTICS',
        EventCode: 'DTMF_MENU_SELECTION',
        ContactId: contactId,
        RuleSet: customerState.CurrentRuleSet,
        Rule: customerState.CurrentRule,
        NextRuleSet: configuredOption,
        When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ValidSelection: 'true',
        Selection: selectedOption
      };

      console.log(JSON.stringify(logPayload, null, 2));
    }
    else
    {
      console.error(`[ERROR] ${contactId} User selected an invalid option: ${selectedOption}`);

      customerState.System.LastSelectedDTMF = undefined;
      stateToSave.add('System');

      var errorRuleSetName = customerState.CurrentRule_errorRuleSetName;
      var noInputRuleSetName = customerState.CurrentRule_noInputRuleSetName;

      // Increment the error count
      errorCount++;
      customerState.CurrentRule_errorCount = '' + errorCount;
      stateToSave.add('CurrentRule_errorCount');

      // Compute the failure reason
      if (selectedOption === 'Timeout')
      {
        customerState.CurrentRule_failureReason = 'NOINPUT';
        stateToSave.add('CurrentRule_failureReason');
      }
      else
      {
        customerState.CurrentRule_failureReason = 'NOMATCH';
        stateToSave.add('CurrentRule_failureReason');
      }

      // Record that we got an invalid selection so we can play the error message
      customerState.CurrentRule_validSelection = 'false';
      stateToSave.add('CurrentRule_validSelection');

      // Compute the next error message and type
      customerState.CurrentRule_errorMessage = customerState['CurrentRule_errorMessage' + errorCount];
      customerState.CurrentRule_errorMessageType = customerState['CurrentRule_errorMessage' + errorCount + 'Type'];
      customerState.CurrentRule_errorMessagePromptArn = customerState['CurrentRule_errorMessage' + errorCount + 'PromptArn'];
      stateToSave.add('CurrentRule_errorMessage');
      stateToSave.add('CurrentRule_errorMessageType');
      stateToSave.add('CurrentRule_errorMessagePromptArn');

      // If we haven't reqached max attempts loop around so play the error and re-prompt
      if (errorCount < inputCount)
      {
        console.info(`Input attempt: ${errorCount} is less than maximum attempts: ${inputCount} playing error message and re-prompting`);

        customerState.CurrentRule_terminate = 'false';
        stateToSave.add('CurrentRule_terminate');
        customerState.CurrentRule_done = 'false';
        stateToSave.add('CurrentRule_done');
      }
      // If we have reached the maximum input attempts work out what the next step is
      else
      {
        console.info(`[INFO] ${contactId} Reached maximum user input attempts: ${inputCount} computing next action`);

        // Found no input
        if (selectedOption === 'Timeout')
        {
          // Check to see if we have a no input error rule set name
          if (isEmptyString(noInputRuleSetName))
          {
            console.info(`[INFO] ${contactId} Found no input with terminate behaviour`);
            customerState.CurrentRule_terminate = 'true';
            stateToSave.add('CurrentRule_terminate');
            customerState.CurrentRule_done = 'true';
            stateToSave.add('CurrentRule_done');
          }
          else
          {
            console.info(`[INFO] ${contactId} Found no input with error ruleset: ${noInputRuleSetName}`);
            customerState.NextRuleSet = noInputRuleSetName;
            stateToSave.add('NextRuleSet');
            customerState.CurrentRule_terminate = 'false';
            stateToSave.add('CurrentRule_terminate');
            customerState.CurrentRule_done = 'true';
            stateToSave.add('CurrentRule_done');
          }
        }
        // Found no match error cause
        else
        {
          // Check to see if we have a no match error rule set name
          if (isEmptyString(errorRuleSetName))
          {
            console.info(`[INFO] ${contactId} Found no match with terminate behaviour`);
            customerState.CurrentRule_terminate = 'true';
            stateToSave.add('CurrentRule_terminate');
            customerState.CurrentRule_done = 'true';
            stateToSave.add('CurrentRule_done');
          }
          else
          {
            console.info(`[INFO] ${contactId} Found no match with error ruleset: ${errorRuleSetName}`);
            customerState.NextRuleSet = errorRuleSetName;
            stateToSave.add('NextRuleSet');
            customerState.CurrentRule_terminate = 'false';
            stateToSave.add('CurrentRule_terminate');
            customerState.CurrentRule_done = 'true';
            stateToSave.add('CurrentRule_done');
          }
        }
      }

      // Log a payload to advise the status of this menu
      var logPayload = {
        EventType: 'ANALYTICS',
        EventCode: 'DTMF_MENU_SELECTION',
        ContactId: contactId,
        RuleSet: customerState.CurrentRuleSet,
        Rule: customerState.CurrentRule,
        When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
        ValidSelection: 'false',
        Selection: selectedOption,
        FailureReason: customerState.failureReason
      };

      console.log(JSON.stringify(logPayload, null, 2));
    }

    // Save the state and return it
    await dynamoUtils.persistCustomerState(process.env.STATE_TABLE, contactId, customerState, Array.from(stateToSave));
    return requestUtils.buildCustomerStateResponse(customerState);
  }
  catch (error)
  {
    console.error(`[ERROR] ${contactId} Failed to process DTMFMenu`, error);
    throw error;
  }
};

/**
 * Checks to see if value is a number
 */
function isNumber(value)
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
}

/**
 * Check for an empty or undefined string
 */
function isEmptyString(value)
{
  if (value === undefined ||
      value === null ||
      value === '')
  {
    return true;
  }
  else
  {
    return false;
  }
}

