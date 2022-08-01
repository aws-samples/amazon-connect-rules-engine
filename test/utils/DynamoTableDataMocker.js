// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const AWS = require('aws-sdk');

/**
*  This sets up a dynamo instance that can be mocked by aws-sdk-mock
*  This could get quite big in the future, replacing the statements
*  with constants could help alleviate some of the clutter in the future
*/
module.exports.setupMockDynamo = function (AWSMock, dynamoUtils) {
    AWSMock.mock('DynamoDB', 'executeStatement', (function (params, callback) {
        if (params.Statement.includes('SELECT *')) {
            if (params.Statement.includes(process.env["USERS_TABLE"])) {
                if (params.Statement.includes('"APIKeyIndex" WHERE "APIKey" = ?')) {
                   callback(null, getDynamoUsersMock(params.Parameters[0]["S"]));
                }
                else {
                  callback(null, getDynamoUsersMock());
                }
            }
            else if (params.Statement.includes(process.env["CONFIG_TABLE"])) {
              callback(null, getAllConfigItemsMock());
            }
        }
        else {
          callback(null, {});
        }
    }));
    dynamoUtils.setDynamoDB(new AWS.DynamoDB())
}

function getAllConfigItemsMock()
{
  return {
    Items: [
      {
        "ConfigData": {
          "S": "[{\"PhoneNumber\":\"+61279084520\",\"Id\":\"d646c2b2-950a-4337-a390-b6a1b3637216\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/phone-number/d646c2b2-950a-4337-a390-b6a1b3637216\",\"CountryCode\":\"AU\",\"Type\":\"DID\"},{\"PhoneNumber\":\"+61296923632\",\"Id\":\"ff851b2e-a766-468e-ba9c-9ca194df57cc\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/phone-number/ff851b2e-a766-468e-ba9c-9ca194df57cc\",\"CountryCode\":\"AU\",\"Type\":\"DID\"},{\"PhoneNumber\":\"+61734973351\",\"Id\":\"66e873b9-0a4b-4836-b2a3-33b11c5d74b4\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/phone-number/66e873b9-0a4b-4836-b2a3-33b11c5d74b4\",\"CountryCode\":\"AU\",\"Type\":\"DID\"}]"
        },
        "ConfigKey": {
          "S": "PhoneNumbers"
        },
        "LastUpdate": {
          "S": "2022-02-22T01:59:53Z"
        }
      },
      {
        "ConfigData": {
          "S": "[{\"Name\":\"dev-rules-engine-connectchecktimeout\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectchecktimeout\"},{\"Name\":\"dev-rules-engine-connectcreatecallback\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectcreatecallback\"},{\"Name\":\"dev-rules-engine-connectdeletecallback\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectdeletecallback\"},{\"Name\":\"dev-rules-engine-connectdtmfinput\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectdtmfinput\"},{\"Name\":\"dev-rules-engine-connectdtmfmenu\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectdtmfmenu\"},{\"Name\":\"dev-rules-engine-connectdtmfselector\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectdtmfselector\"},{\"Name\":\"dev-rules-engine-connectgetcallbackstatus\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectgetcallbackstatus\"},{\"Name\":\"dev-rules-engine-connectintegrationstart\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectintegrationstart\"},{\"Name\":\"dev-rules-engine-connectloadstate\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectloadstate\"},{\"Name\":\"dev-rules-engine-connectnlumenu\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectnlumenu\"},{\"Name\":\"dev-rules-engine-connectpromptsonhold\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectpromptsonhold\"},{\"Name\":\"dev-rules-engine-connectrulesinference\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectrulesinference\"},{\"Name\":\"dev-rules-engine-connectsendsms\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectsendsms\"},{\"Name\":\"dev-rules-engine-connectupdatestate\",\"Arn\":\"arn:aws:lambda:ap-southeast-2:590951301234:function:dev-rules-engine-connectupdatestate\"}]"
        },
        "ConfigKey": {
          "S": "LambdaFunctions"
        },
        "LastUpdate": {
          "S": "2022-02-22T01:59:54Z"
        }
      },
      {
        "ConfigData": {
          "S": "Australia/Melbourne"
        },
        "ConfigKey": {
          "S": "CallCentreTimeZone"
        },
        "LastUpdate": {
          "S": "2021-07-01T00:00:00Z"
        }
      },
      {
        "ConfigData": {
          "S": "[{\"holidayId\":\"27ad8088-c68d-4052-8e22-c5545ceed288\",\"when\":\"20211225\",\"name\":\"Christmas Day 2021\",\"description\":\"Christmas Day 2021.\",\"closed\":false},{\"holidayId\":\"f1bb3e45-adef-49a2-8326-2c96a5a470c7\",\"when\":\"20211226\",\"name\":\"Boxing Day 2021\",\"description\":\"Boxing Day 2021\",\"closed\":false}]"
        },
        "ConfigKey": {
          "S": "Holidays"
        },
        "LastUpdate": {
          "S": "2022-01-26T23:08:14Z"
        }
      },
      {
        "ConfigData": {
          "S": "[{\"Name\":\"Basic Routing Profile\",\"Id\":\"b4d3cc16-5608-4ce8-87b6-9496da94b441\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/routing-profile/b4d3cc16-5608-4ce8-87b6-9496da94b441\",\"Queues\":[{\"QueueId\":\"3f90b899-b9e6-46bf-bab0-bc7af4cd5af6\",\"QueueArn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/queue/3f90b899-b9e6-46bf-bab0-bc7af4cd5af6\",\"QueueName\":\"Sales\",\"Priority\":1,\"Delay\":0,\"Channel\":\"VOICE\"},{\"QueueId\":\"8599f3c7-0831-4882-a542-d2d4e1b75fb4\",\"QueueArn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/queue/8599f3c7-0831-4882-a542-d2d4e1b75fb4\",\"QueueName\":\"TechnicalSupport\",\"Priority\":3,\"Delay\":0,\"Channel\":\"VOICE\"},{\"QueueId\":\"c26ce516-afed-439f-8a5a-8b9af04ea896\",\"QueueArn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/queue/c26ce516-afed-439f-8a5a-8b9af04ea896\",\"QueueName\":\"Billing\",\"Priority\":1,\"Delay\":0,\"Channel\":\"VOICE\"}]}]"
        },
        "ConfigKey": {
          "S": "RoutingProfiles"
        },
        "LastUpdate": {
          "S": "2022-02-22T01:59:53Z"
        }
      },
      {
        "ConfigData": {
          "S": "2022-02-22T01:59:54Z"
        },
        "ConfigKey": {
          "S": "LastChangeTimestamp"
        },
        "LastUpdate": {
          "S": "2022-02-22T01:59:54Z"
        }
      },
      {
        "ConfigData": {
          "S": "[{\"Name\":\"Default agent whisper\",\"Id\":\"b294ce7c-1990-43ee-b7bc-f08604a8d3e1\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/b294ce7c-1990-43ee-b7bc-f08604a8d3e1\",\"Type\":\"AGENT_WHISPER\",\"State\":null},{\"Name\":\"Default customer hold\",\"Id\":\"9968c3d2-c418-46bf-ae80-1b9bc0a5f577\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/9968c3d2-c418-46bf-ae80-1b9bc0a5f577\",\"Type\":\"CUSTOMER_HOLD\",\"State\":null},{\"Name\":\"Default customer queue\",\"Id\":\"b1b53785-fd48-4af9-b8cc-98ed6209b9dc\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/b1b53785-fd48-4af9-b8cc-98ed6209b9dc\",\"Type\":\"CUSTOMER_QUEUE\",\"State\":null},{\"Name\":\"Default customer whisper\",\"Id\":\"cbe5056a-6a93-4256-a7f2-5f034f39852a\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/cbe5056a-6a93-4256-a7f2-5f034f39852a\",\"Type\":\"CUSTOMER_WHISPER\",\"State\":null},{\"Name\":\"Default outbound\",\"Id\":\"f86416d5-a839-4866-aa79-b11cdfbb0ce9\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/f86416d5-a839-4866-aa79-b11cdfbb0ce9\",\"Type\":\"OUTBOUND_WHISPER\",\"State\":null},{\"Name\":\"RulesEngineAgentWhisper\",\"Id\":\"c314bf9a-949a-4f3f-9b7a-980f35b5b3ea\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/c314bf9a-949a-4f3f-9b7a-980f35b5b3ea\",\"Type\":\"AGENT_WHISPER\",\"State\":null},{\"Name\":\"RulesEngineAuditCall\",\"Id\":\"8c6dbccf-b535-4911-afa8-ddcd14f5bf52\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/8c6dbccf-b535-4911-afa8-ddcd14f5bf52\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineBootstrap\",\"Id\":\"35aa1f43-b51b-4426-8695-c6cc69b0ba37\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/35aa1f43-b51b-4426-8695-c6cc69b0ba37\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineCustomerHold\",\"Id\":\"41696946-4033-479a-a618-7af8d5f9adb5\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/41696946-4033-479a-a618-7af8d5f9adb5\",\"Type\":\"CUSTOMER_HOLD\",\"State\":null},{\"Name\":\"RulesEngineCustomerQueue\",\"Id\":\"48313461-6db7-4f61-b8dd-adc02c8206ef\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/48313461-6db7-4f61-b8dd-adc02c8206ef\",\"Type\":\"CUSTOMER_QUEUE\",\"State\":null},{\"Name\":\"RulesEngineCustomerWhisper\",\"Id\":\"d8159dcd-ff99-4054-aa4d-f5ddd0ccdd99\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/d8159dcd-ff99-4054-aa4d-f5ddd0ccdd99\",\"Type\":\"CUSTOMER_WHISPER\",\"State\":null},{\"Name\":\"RulesEngineDTMFInput\",\"Id\":\"8d355e2b-38bb-4d9c-861f-379045dabf6a\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/8d355e2b-38bb-4d9c-861f-379045dabf6a\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineDTMFMenu\",\"Id\":\"02b1e13e-6cd4-47cb-b702-582b35eb5dd2\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/02b1e13e-6cd4-47cb-b702-582b35eb5dd2\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineDTMFSelector\",\"Id\":\"c260f015-d54c-4fca-9463-e22211f55747\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/c260f015-d54c-4fca-9463-e22211f55747\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineError\",\"Id\":\"c7952efe-4a18-4a87-a9a7-f770ac4f7a2e\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/c7952efe-4a18-4a87-a9a7-f770ac4f7a2e\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineExternalNumber\",\"Id\":\"049d7710-2c0e-4162-b05b-31abcc7dd22d\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/049d7710-2c0e-4162-b05b-31abcc7dd22d\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineIntegration\",\"Id\":\"be49023e-bde2-4cce-8efa-c99b503d1645\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/be49023e-bde2-4cce-8efa-c99b503d1645\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineMain\",\"Id\":\"97fc0f47-6dad-40a6-a1df-97ad096bf34a\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/97fc0f47-6dad-40a6-a1df-97ad096bf34a\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineMessage\",\"Id\":\"8df28391-a008-43cf-b0a1-6595bc7488bf\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/8df28391-a008-43cf-b0a1-6595bc7488bf\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineMetric\",\"Id\":\"16818b3e-e2f9-40cc-b917-f4a8462cb279\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/16818b3e-e2f9-40cc-b917-f4a8462cb279\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineNLUMenu\",\"Id\":\"b38e172d-3a6c-4208-adb4-aeba18e9a6ae\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/b38e172d-3a6c-4208-adb4-aeba18e9a6ae\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineOutboundWhisper\",\"Id\":\"6ab6ad57-64d3-4f6d-aec5-9d8c6868b110\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/6ab6ad57-64d3-4f6d-aec5-9d8c6868b110\",\"Type\":\"OUTBOUND_WHISPER\",\"State\":null},{\"Name\":\"RulesEngineQueue\",\"Id\":\"9f4e2f03-5dff-4d3e-bc3d-9f757afd6ed6\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/9f4e2f03-5dff-4d3e-bc3d-9f757afd6ed6\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineRuleSet\",\"Id\":\"6914683f-f3a9-4739-9262-df3a7716ef86\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/6914683f-f3a9-4739-9262-df3a7716ef86\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineRuleSetBail\",\"Id\":\"1c04e12f-a999-4c16-b873-b2b0f44a0c8a\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/1c04e12f-a999-4c16-b873-b2b0f44a0c8a\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineRuleSetPrompt\",\"Id\":\"c5a1ddcd-ce56-42a2-9538-cf01b9638cba\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/c5a1ddcd-ce56-42a2-9538-cf01b9638cba\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineSecureDTMFInput\",\"Id\":\"96164c29-b013-4023-b1dc-612311399aa9\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/96164c29-b013-4023-b1dc-612311399aa9\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineSetAttribute\",\"Id\":\"5bf2a8d4-4424-46cd-9dd0-fe4eadeef830\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/5bf2a8d4-4424-46cd-9dd0-fe4eadeef830\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineSetAttributes\",\"Id\":\"c7738fab-5164-41a5-a8f5-f89177bbd7ca\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/c7738fab-5164-41a5-a8f5-f89177bbd7ca\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineSMSMessage\",\"Id\":\"5f45f677-f5e0-4a4a-b48f-0f07d739919b\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/5f45f677-f5e0-4a4a-b48f-0f07d739919b\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineStaffing\",\"Id\":\"990922cc-5a5b-4cfc-9cdc-509f50d0693e\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/990922cc-5a5b-4cfc-9cdc-509f50d0693e\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineTerminate\",\"Id\":\"9bed2ae8-d517-45fa-9ea4-f28dcd016c33\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/9bed2ae8-d517-45fa-9ea4-f28dcd016c33\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"RulesEngineUpdateState\",\"Id\":\"2419c86b-80cd-4008-8ece-6a7789bc8917\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/2419c86b-80cd-4008-8ece-6a7789bc8917\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"Sample AB test\",\"Id\":\"881afc3a-b175-476d-b563-4bc83c2fda87\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/881afc3a-b175-476d-b563-4bc83c2fda87\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"Sample disconnect flow\",\"Id\":\"c89ac639-3312-47c0-a87f-1d275391a516\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/c89ac639-3312-47c0-a87f-1d275391a516\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"Sample inbound flow (first contact experience)\",\"Id\":\"8a04ef76-3633-4bbb-a8be-8a13f4eeb5d7\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/8a04ef76-3633-4bbb-a8be-8a13f4eeb5d7\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"Sample interruptible queue flow with callback\",\"Id\":\"5bce8ff4-6cf8-4870-8596-23e84fcb0e7f\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/5bce8ff4-6cf8-4870-8596-23e84fcb0e7f\",\"Type\":\"CUSTOMER_QUEUE\",\"State\":null},{\"Name\":\"Sample Lambda integration\",\"Id\":\"40010465-e3af-4296-9f22-e5599f3849fd\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/40010465-e3af-4296-9f22-e5599f3849fd\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"Sample note for screenpop\",\"Id\":\"5df88807-7cbe-48d8-a943-710e8c1e3f57\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/5df88807-7cbe-48d8-a943-710e8c1e3f57\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"Sample queue configurations flow\",\"Id\":\"037ab812-4716-4457-8a91-f72f4eaaa27e\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/037ab812-4716-4457-8a91-f72f4eaaa27e\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"Sample queue customer\",\"Id\":\"b7c087de-bef0-43c6-a952-51bf9f03b2b3\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/b7c087de-bef0-43c6-a952-51bf9f03b2b3\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"Sample recording behavior\",\"Id\":\"8487636c-198a-4c00-87b2-3b9c32243b54\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/8487636c-198a-4c00-87b2-3b9c32243b54\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"Sample secure input with no agent\",\"Id\":\"c2d0c9f6-c8aa-4af8-9966-c69769a3ad27\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/c2d0c9f6-c8aa-4af8-9966-c69769a3ad27\",\"Type\":\"CONTACT_FLOW\",\"State\":null},{\"Name\":\"ZZRulesEngineAgentWhisperBackup\",\"Id\":\"7a0de9e9-a40d-4936-8d44-95803f28b481\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/contact-flow/7a0de9e9-a40d-4936-8d44-95803f28b481\",\"Type\":\"AGENT_WHISPER\",\"State\":null}]"
        },
        "ConfigKey": {
          "S": "ContactFlows"
        },
        "LastUpdate": {
          "S": "2022-02-22T01:59:53Z"
        }
      },
      {
        "ConfigData": {
          "S": "[{\"Name\":\"Billing\",\"Description\":\"Billing queue\",\"Id\":\"c26ce516-afed-439f-8a5a-8b9af04ea896\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/queue/c26ce516-afed-439f-8a5a-8b9af04ea896\",\"MaxContacts\":null,\"Status\":\"ENABLED\",\"HoursOfOperationId\":\"1114c8c9-d674-4b4a-826c-6699550f1607\"},{\"Name\":\"Sales\",\"Description\":\"Sales queue\",\"Id\":\"3f90b899-b9e6-46bf-bab0-bc7af4cd5af6\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/queue/3f90b899-b9e6-46bf-bab0-bc7af4cd5af6\",\"OutboundCallerConfig\":{\"OutboundCallerIdName\":\"AWS\",\"OutboundCallerIdNumberId\":\"66e873b9-0a4b-4836-b2a3-33b11c5d74b4\",\"OutboundFlowId\":\"6ab6ad57-64d3-4f6d-aec5-9d8c6868b110\"},\"MaxContacts\":10,\"Status\":\"ENABLED\",\"HoursOfOperationId\":\"0d7d9afa-8074-4da3-a9f7-c0d59ae56e11\"},{\"Name\":\"TechnicalSupport\",\"Description\":\"Technical support queue\",\"Id\":\"8599f3c7-0831-4882-a542-d2d4e1b75fb4\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/queue/8599f3c7-0831-4882-a542-d2d4e1b75fb4\",\"MaxContacts\":null,\"Status\":\"ENABLED\",\"HoursOfOperationId\":\"1b279d54-4491-40d0-b98d-ae500411557f\"}]"
        },
        "ConfigKey": {
          "S": "Queues"
        },
        "LastUpdate": {
          "S": "2022-02-22T01:59:53Z"
        }
      },
      {
        "ConfigData": {
          "S": "[{\"Name\":\"dev-rules-engine-intent\",\"SimpleName\":\"intent\",\"Arn\":\"arn:aws:lex:ap-southeast-2:590951301234:bot-alias/55DJMPH6ZM/V2EKNCMEVK\",\"Id\":\"55DJMPH6ZM\",\"LocaleId\":\"en_AU\",\"AliasId\":\"V2EKNCMEVK\"},{\"Name\":\"dev-rules-engine-quick\",\"SimpleName\":\"quick\",\"Arn\":\"arn:aws:lex:ap-southeast-2:590951301234:bot-alias/X8ILGBZFIS/XNCNNROJMJ\",\"Id\":\"X8ILGBZFIS\",\"LocaleId\":\"en_AU\",\"AliasId\":\"XNCNNROJMJ\"},{\"Name\":\"dev-rules-engine-yesno\",\"SimpleName\":\"yesno\",\"Arn\":\"arn:aws:lex:ap-southeast-2:590951301234:bot-alias/3YMEQBGMTY/3FE2GWDOCA\",\"Id\":\"3YMEQBGMTY\",\"LocaleId\":\"en_AU\",\"AliasId\":\"3FE2GWDOCA\"}]"
        },
        "ConfigKey": {
          "S": "LexBots"
        },
        "LastUpdate": {
          "S": "2022-02-22T01:59:54Z"
        }
      },
      {
        "ConfigData": {
          "S": "[{\"Name\":\"Beep.wav\",\"Id\":\"f0663a4a-f20b-452e-9673-3c38d5b5cb23\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/prompt/f0663a4a-f20b-452e-9673-3c38d5b5cb23\"},{\"Name\":\"CustomerHold.wav\",\"Id\":\"cef93e9a-d518-4d03-9858-9f4068ae5304\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/prompt/cef93e9a-d518-4d03-9858-9f4068ae5304\"},{\"Name\":\"CustomerQueue.wav\",\"Id\":\"a927fd30-4ff7-4bff-aa95-347d7c8bea1b\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/prompt/a927fd30-4ff7-4bff-aa95-347d7c8bea1b\"},{\"Name\":\"Music_Jazz_MyTimetoFly_Inst.wav\",\"Id\":\"60eb6a11-758c-4a3a-8424-19bc2f3331d4\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/prompt/60eb6a11-758c-4a3a-8424-19bc2f3331d4\"},{\"Name\":\"Music_Pop_ThisAndThatIsLife_Inst.wav\",\"Id\":\"6dd221f2-f950-44ad-b5e7-bd293791243e\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/prompt/6dd221f2-f950-44ad-b5e7-bd293791243e\"},{\"Name\":\"Music_Pop_ThrowYourselfInFrontOfIt_Inst.wav\",\"Id\":\"6d5818c8-f238-48e8-8c8e-66b091ac7e68\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/prompt/6d5818c8-f238-48e8-8c8e-66b091ac7e68\"},{\"Name\":\"Music_Rock_EverywhereTheSunShines_Inst.wav\",\"Id\":\"5be4819c-9c25-4887-8902-577a54c06813\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/prompt/5be4819c-9c25-4887-8902-577a54c06813\"}]"
        },
        "ConfigKey": {
          "S": "Prompts"
        },
        "LastUpdate": {
          "S": "2022-02-22T01:59:53Z"
        }
      },
      {
        "ConfigData": {
          "S": "[{\"Name\":\"Billing\",\"Description\":\"Billing hours\",\"Id\":\"1114c8c9-d674-4b4a-826c-6699550f1607\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/operating-hours/1114c8c9-d674-4b4a-826c-6699550f1607\",\"Timezone\":\"Australia/Melbourne\",\"Config\":[{\"Day\":\"MONDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":17,\"Minutes\":0}},{\"Day\":\"THURSDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":17,\"Minutes\":0}},{\"Day\":\"WEDNESDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":17,\"Minutes\":0}},{\"Day\":\"FRIDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":17,\"Minutes\":0}},{\"Day\":\"TUESDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":17,\"Minutes\":0}}]},{\"Name\":\"EasternStates\",\"Description\":\"Eastern states\",\"Id\":\"0fb17e7d-5f3b-490c-8ea7-7dd874325e46\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/operating-hours/0fb17e7d-5f3b-490c-8ea7-7dd874325e46\",\"Timezone\":\"Australia/Melbourne\",\"Config\":[{\"Day\":\"TUESDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":12,\"Minutes\":0}},{\"Day\":\"FRIDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":12,\"Minutes\":0}},{\"Day\":\"MONDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":12,\"Minutes\":0}},{\"Day\":\"WEDNESDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":12,\"Minutes\":0}},{\"Day\":\"THURSDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":12,\"Minutes\":0}}]},{\"Name\":\"Sales\",\"Description\":\"Sales hours\",\"Id\":\"0d7d9afa-8074-4da3-a9f7-c0d59ae56e11\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/operating-hours/0d7d9afa-8074-4da3-a9f7-c0d59ae56e11\",\"Timezone\":\"Australia/Melbourne\",\"Config\":[{\"Day\":\"FRIDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":17,\"Minutes\":0}},{\"Day\":\"SATURDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":17,\"Minutes\":0}},{\"Day\":\"TUESDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":17,\"Minutes\":0}},{\"Day\":\"WEDNESDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":17,\"Minutes\":0}},{\"Day\":\"THURSDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":17,\"Minutes\":0}},{\"Day\":\"MONDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":22,\"Minutes\":0}}]},{\"Name\":\"TechnicalSupport\",\"Description\":\"Technical support hours\",\"Id\":\"1b279d54-4491-40d0-b98d-ae500411557f\",\"Arn\":\"arn:aws:connect:ap-southeast-2:590951301234:instance/a705ad48-5a54-483a-813c-d4a64f345087/operating-hours/1b279d54-4491-40d0-b98d-ae500411557f\",\"Timezone\":\"Australia/Melbourne\",\"Config\":[{\"Day\":\"WEDNESDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":19,\"Minutes\":0}},{\"Day\":\"TUESDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":19,\"Minutes\":0}},{\"Day\":\"FRIDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":19,\"Minutes\":0}},{\"Day\":\"THURSDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":19,\"Minutes\":0}},{\"Day\":\"SATURDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":19,\"Minutes\":0}},{\"Day\":\"MONDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":19,\"Minutes\":0}},{\"Day\":\"SUNDAY\",\"StartTime\":{\"Hours\":9,\"Minutes\":0},\"EndTime\":{\"Hours\":19,\"Minutes\":0}}]}]"
        },
        "ConfigKey": {
          "S": "OperatingHours"
        },
        "LastUpdate": {
          "S": "2022-02-22T01:59:52Z"
        }
      }
    ]
  };
}

function getDynamoUsersMock(apiKey) {
    var dynamoResponse = {
        Items: [
            {
                "EmailAddress": {
                    "S": "fake.user@test.aws.com"
                },
                "UserId": {
                    "S": "19b1dc36-3ad6-11ec-97b9-b124ea8f11eb"
                },
                "UserRole": {
                    "S": "POWER_USER"
                },
                "UserEnabled": {
                    "S": "true"
                },
                "APIKey": {
                    "S": "1a123456-ab12-1a2a-1c23-b123456ef789"
                },
                "FirstName": {
                    "S": "FAKE"
                },
                "LastName": {
                    "S": "USER"
                }
            },
            {
                "EmailAddress": {
                    "S": "test.user@test.aws.com"
                },
                "UserId": {
                    "S": "29b1dc36-3ad6-11ec-97b9-b124ea8f11eb"
                },
                "UserRole": {
                    "S": "TESTER"
                },
                "UserEnabled": {
                    "S": "true"
                },
                "APIKey": {
                    "S": "FAKE_API_KEY_1"
                },
                "FirstName": {
                    "S": "Test"
                },
                "LastName": {
                    "S": "User"
                }
            }
        ]
    }
    if(apiKey){
        var results = dynamoResponse.Items.filter(user => user.APIKey.S === apiKey && user.UserEnabled.S === "true")
        console.log(results)
        return { Items: results }
    } else {
        return dynamoResponse;
    }
}
