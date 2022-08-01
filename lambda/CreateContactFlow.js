
var requestUtils = require('./utils/RequestUtils.js');
var connectUtils = require('./utils/ConnectUtils.js');

/**
 * Creates a contact flow if it doesn't exist
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

    var response = {
      success: true,
      created: false,
      name: contactFlow.name
    };

    var template = null;
    var createContactFlowResponse = null;

    if (contactFlow.status === 'MISSING')
    {
      if (contactFlow.name.includes('AgentWhisper'))
      {
        console.log('[INFO] about to create missing agent whisper contact flow: ' + contactFlow.name);
        template = connectUtils.loadContactFlowTemplate('empty_agent_whisper_flow');
        createContactFlowResponse = await connectUtils.createContactFlow(process.env.INSTANCE_ID, contactFlow.name, template, 'AGENT_WHISPER');
        response.created = true;
        response.id = createContactFlowResponse.ContactFlowId;
        response.arn = createContactFlowResponse.ContactFlowArn;
      }
      else if (contactFlow.name.includes('CustomerQueue'))
      {
        console.log('[INFO] about to create missing custoemr queue flow: ' + contactFlow.name);
        template = connectUtils.loadContactFlowTemplate('empty_customer_queue_flow');
        createContactFlowResponse = await connectUtils.createContactFlow(process.env.INSTANCE_ID, contactFlow.name, template, 'CUSTOMER_QUEUE');
        response.created = true;
        response.id = createContactFlowResponse.ContactFlowId;
        response.arn = createContactFlowResponse.ContactFlowArn;
      }
      else if (contactFlow.name.includes('CustomerHold'))
      {
        console.log('[INFO] about to create missing customer hold flow: ' + contactFlow.name);
        template = connectUtils.loadContactFlowTemplate('empty_customer_hold_flow');
        createContactFlowResponse = await connectUtils.createContactFlow(process.env.INSTANCE_ID, contactFlow.name, template, 'CUSTOMER_HOLD');
        response.created = true;
        response.id = createContactFlowResponse.ContactFlowId;
        response.arn = createContactFlowResponse.ContactFlowArn;
      }
      else if (contactFlow.name.includes('CustomerWhisper'))
      {
        console.log('[INFO] about to create missing customer whisper flow: ' + contactFlow.name);
        template = connectUtils.loadContactFlowTemplate('empty_customer_whisper_flow');
        createContactFlowResponse = await connectUtils.createContactFlow(process.env.INSTANCE_ID, contactFlow.name, template, 'CUSTOMER_WHISPER');
        response.created = true;
        response.id = createContactFlowResponse.ContactFlowId;
        response.arn = createContactFlowResponse.ContactFlowArn;
      }
      else if (contactFlow.name.includes('OutboundWhisper'))
      {
        console.log('[INFO] about to create missing outbound whisper flow: ' + contactFlow.name);
        template = connectUtils.loadContactFlowTemplate('empty_outbound_whisper_flow');
        createContactFlowResponse = await connectUtils.createContactFlow(process.env.INSTANCE_ID, contactFlow.name, template, 'OUTBOUND_WHISPER');
        response.created = true;
        response.id = createContactFlowResponse.ContactFlowId;
        response.arn = createContactFlowResponse.ContactFlowArn;
      }
      else
      {
        console.log('[INFO] about to create missing contact flow: ' + contactFlow.name);
        template = connectUtils.loadContactFlowTemplate('empty_flow');
        createContactFlowResponse = await connectUtils.createContactFlow(process.env.INSTANCE_ID, contactFlow.name, template, 'CONTACT_FLOW');
        response.created = true;
        response.id = createContactFlowResponse.ContactFlowId;
        response.arn = createContactFlowResponse.ContactFlowArn;
      }
    }
    else
    {
      console.log('[INFO] skipping existing contact flow: ' + contactFlow.name);
    }

    return requestUtils.buildSuccessfulResponse(response);
  }
  catch (error)
  {
    console.log('[ERROR] failed to create contact flow', error);
    return requestUtils.buildErrorResponse(error);
  }
};
