// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var AWS = require('aws-sdk');

const { v4: uuidv4 } = require('uuid');

var lexmodelsv2 = new AWS.LexModelsV2();
var lexruntimev2 = new AWS.LexRuntimeV2();

/**
 * Allow injection of mock model
 */
module.exports.setLexModelsV2 = function(models){
  lexmodelsv2 = models;
}

/**
 * Allow injection of mock run time
 */
module.exports.setLexRuntimeV2 = function(runTime){
  lexruntimev2 = runTime;
}


/**
 * Lists bots for this environment
 */
module.exports.listLexBots = async (stage, service) =>
{
  var prefix = `${stage}-${service}-`;

  try
  {
    var params = {
      maxResults: '100'
    };

    var bots = [];

    var response = await lexmodelsv2.listBots(params).promise();

    console.log('[INFO] got response: ' + JSON.stringify(response, null, 2));

    bots = bots.concat(response.botSummaries.filter(bot => bot.botName.startsWith(prefix)));

    while (response.nextToken !== null)
    {
      response = await lexmodelsv2.listBots(params).promise();
      console.log('[INFO] got response: ' + JSON.stringify(response, null, 2));
      bots = bots.concat(response.botSummaries.filter(bot => bot.botName.startsWith(prefix)));
    }

    return bots;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list bots', error);
    throw error;
  }
};

/**
 * Fetches all of the ids and arns for a lexv2 bot
 */
module.exports.describeLexBot = async (stage, service, region, accountNumber, botName, botLocale, botAlias) =>
{
  try
  {
    var lexPrefix = `${stage}-${service}-`;

    var bot = await module.exports.getBotByName(botName);
    var aliases = await module.exports.listBotAliases(bot.botId);

    var matchedAlias = aliases.find(a => a.botAliasName === botAlias);

    if (matchedAlias === undefined)
    {
      throw new Error(`Failed to locate alias: ${botAlias} on bot: ${botName}`);
    }

    var response = {
      Name: botName,
      SimpleName: botName.substring(lexPrefix.length),
      Arn: `arn:aws:lex:${region}:${accountNumber}:bot-alias/${bot.botId}/${matchedAlias.botAliasId}`,
      Id: bot.botId,
      LocaleId: botLocale,
      AliasId: matchedAlias.botAliasId
    };

    return response;
  }
  catch (error)
  {
    console.log('[ERROR] failed to fetch bot alias', error);
    throw error;
  }

}

/**
 * Fetches a bot by name
 */
module.exports.getBotByName = async(botName) =>
{
  try
  {
    var params = {
      filters: [
        {
          name: 'BotName',
          operator: 'EQ',
          values: [
            botName
          ]
        }
      ],
      maxResults: '100'
    };

    var response = await lexmodelsv2.listBots(params).promise();

    if (response.botSummaries.length === 1)
    {
      return response.botSummaries[0];
    }

    throw new Error('Bot not found: ' + botName);
  }
  catch (error)
  {
    console.log('[ERROR] failed to find bot by name', error);
    throw error;
  }
};

/**
 * Lists intents for a bot version
 */
module.exports.listIntents = async(botId, botVersion, localeId) =>
{
  try
  {
    var request = {
      botId: botId,
      botVersion: botVersion,
      localeId: localeId
    };

    var intents = [];

    var response = await lexmodelsv2.listIntents(request).promise();

    intents = intents.concat(response.intentSummaries);

    while (response.nextToken !== null)
    {
      request.nextToken = response.nextToken;
      response = await lexmodelsv2.listIntents(request).promise();
      intents = intents.concat(response.intentSummaries);
    }

    intents.sort(function (a, b) {
      return a.intentName.localeCompare(b.intentName);
    });

    // Remove the fall back intent
    return intents.filter(intent => intent.intentName !== 'FallbackIntent');
  }
  catch (error)
  {
    console.log('[ERROR] failed to list intents: ' + error.message);
    throw error;
  }
};

/**
 * Lists aliases for a bot
 */
module.exports.listBotAliases = async(botId) =>
{
  try
  {
    var request = {
      botId: botId,
      maxResults: 100
    };

    var aliases = [];

    var response = await lexmodelsv2.listBotAliases(request).promise();

    aliases = aliases.concat(response.botAliasSummaries);

    while (response.nextToken !== null)
    {
      request.nextToken = response.nextToken;
      response = await lexmodelsv2.listBotAliases(request).promise();
      aliases = aliases.concat(response.botAliasSummaries);
    }

    return aliases;
  }
  catch (error)
  {
    console.log('[ERROR] failed to list bot aliases', error);
    throw error;
  }
};

/**
 * Inferences a Lex bot returning the matched intent and confidence
 */
module.exports.recognizeText = async (botId, aliasId, localeId, text) =>
{
  try
  {
    var inferenceRequest = {
      botAliasId: aliasId,
      botId: botId,
      localeId: localeId,
      sessionId: uuidv4(),
      text: text
    };

    var inferenceResponse = await lexruntimev2.recognizeText(inferenceRequest).promise();

    // console.info('Got inference response: ' + JSON.stringify(inferenceResponse, null, 2));

    var interpretation = inferenceResponse.interpretations[0];

    var score = 0;

    if (interpretation.nluConfidence !== undefined)
    {
      score = interpretation.nluConfidence.score;
    }

    return {
      intent: interpretation.intent.name,
      confidence: score,
      slots: interpretation.intent.slots
    };
  }
  catch (error)
  {
    console.error('Failed to inference LexV2 bot', error);
    throw error;
  }
};


