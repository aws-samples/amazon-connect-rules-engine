// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var AWS = require('aws-sdk');
AWS.config.update({region: process.env.REGION});
const pinpoint = new AWS.Pinpoint();

/**
 * Sends a message using pin point
 * messageType can PROMOTIONAL or TRANSACTIONAL
 */
module.exports.sendSMS = async function(phoneNumber,
      message,
      originationNumber,
      pinpointApplicationId,
      messageType = 'PROMOTIONAL')
{
  try
  {

    var phoneNumberToUse = phoneNumber;

    // TODO assumes AU phone number here
    if (phoneNumberToUse.startsWith('0'))
    {
      phoneNumberToUse = '+61' + phoneNumberToUse.substring(1);
    }


    const params =
    {
      ApplicationId: pinpointApplicationId,
      MessageRequest:
      {
        Addresses:
        {
          [phoneNumberToUse]:
          {
            ChannelType: 'SMS',
          }
        },
        MessageConfiguration:
        {
          SMSMessage:
          {
            Body: message,
            OriginationNumber: originationNumber,
            MessageType: messageType
          }
        }
      }
    };

    console.info(`Sending Pinpoint SMS using: ${JSON.stringify(params, null, 2)}`);

    const result = await pinpoint.sendMessages(params).promise();

    console.info(`Got Pinpoint result: ${JSON.stringify(result, null, 2)}`);

    if (result.MessageResponse.Result[phoneNumber].StatusCode !== 200)
    {
      console.error(`Pinpoint SMS message error code: ${result.MessageResponse.Result[phoneNumber].StatusCode}`);
      throw new Error(`Pinpoint SMS message error code: ${result.MessageResponse.Result[phoneNumber].StatusCode}`);
    }

    console.info(`Sent successful Pinpoint SMS message`);
  }
  catch (error)
  {
    console.error(`Detected error while sending Pinpoint SMS`, error);
    return error;
  }
}
