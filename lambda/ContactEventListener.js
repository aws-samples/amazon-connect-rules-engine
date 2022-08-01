
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');

var moment = require('moment-timezone');

/**
 * Listens for contact events from Amazon Connect
 */
exports.handler = async(event, context) =>
{
  console.info(JSON.stringify(event, null, 2));

  if (event.detail.eventType === 'DISCONNECTED')
  {
    await loadContactAttributesAndLog(event);
  }
}

/**
 * Loads contact attributes and logs the event
 */
async function loadContactAttributesAndLog(event)
{
  try
  {
    var initialContactId = event.detail.contactId;

    if (event.detail.initialContactId !== undefined)
    {
      initialContactId = event.detail.initialContactId;
    }

    var customerState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, initialContactId);

    var existingAttributes = await connectUtils.getContactAttributes(process.env.INSTANCE_ID, initialContactId);
    var attributesDelta = connectUtils.computeAttributesDelta(existingAttributes, customerState.ContactAttributes);

    // Just concern ourselves with state attributes that have changed wrt to connect attributes
    if (attributesDelta.length > 0)
    {
      attributesDelta.forEach(delta => {
        existingAttributes[delta.key] = delta.value;
      });
      console.info(`ContactId: ${initialContactId} contact attributes have changed writing final attributes: ${JSON.stringify(existingAttributes, null, 2)}`);
      await connectUtils.updateContactAttributes(process.env.INSTANCE_ID, initialContactId, existingAttributes);
    }
    else
    {
      console.info(`ContactId: ${initialContactId} contact attributes have not changed`);
    }

    var sortedAttributes = {};

    var keys = Object.keys(existingAttributes).sort();
    keys.forEach(key => {
      sortedAttributes[key] = existingAttributes[key];
    });

    var logPayload = {
      EventType: 'ANALYTICS',
      EventCode: 'CONTACT_EVENT',
      ContactEventType: event.detail.eventType,
      ContactId: initialContactId,
      RuleSet: customerState.CurrentRuleSet,
      RuleType: customerState.CurrentRuleType,
      RuleName: customerState.CurrentRule,
      When: moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
      ConnectEvent: event,
      ContactAttributes: sortedAttributes
    };

    console.log(JSON.stringify(logPayload, null, 2));

    return logPayload;
  }
  catch (error)
  {
    console.error(`Failed to load contact attributes and log event for contact id: [${initialContactId}]`, error);
    throw error;
  }
}
