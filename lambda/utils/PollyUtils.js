var AWS = require('aws-sdk');
var polly = new AWS.Polly();
var moment = require('moment-timezone');

const { v4: uuidv4 } = require('uuid');

/**
 * Support mock injection
 */
module.exports.setDynamoDB = function(newPolly)
{
  polly = newPolly;
}

/**
 * Renders speech from text using Amazon Polly
 * as a wav and returns this with Base64 encoding
 */
module.exports.synthesizeVoice = async (text, voiceId = 'Olivia', languageCode = 'en-AU') =>
{
  try
  {
    // TODO determine text type from input text, assumes 'text' for now

    var params = {
      OutputFormat: 'mp3',
      SampleRate: '8000',
      Text: text,
      Engine: 'neural',
      TextType: 'text',
      LanguageCode: languageCode,
      VoiceId: voiceId
    };

    if (text.startsWith('<speak'))
    {
      params.TextType = 'ssml';
    }

    var response = await polly.synthesizeSpeech(params).promise();

    return response.AudioStream.toString('base64');
  }
  catch (error)
  {
    console.error('Failed to render voice', error);
    throw error;
  }
};

