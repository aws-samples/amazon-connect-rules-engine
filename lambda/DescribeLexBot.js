
var moment = require('moment-timezone');

var requestUtils = require('./utils/RequestUtils.js');
var lexUtils = require('./utils/LexUtils.js');

/**
 * Describes a lex bot
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var body = JSON.parse(event.body);
    var botName = body.botName;

    var botAlias = process.env.BOT_ALIAS;
    var botLocalId = process.env.BOT_LOCALE_ID;

    console.log('[INFO] got input: ' + JSON.stringify(body, null, 2));

    var qualifiedBotName = `${process.env.STAGE}-${process.env.SERVICE}-${botName}`;

    // Load the bot by name to get the bot id
    var bot = await lexUtils.getBotByName(qualifiedBotName);

    console.log('[INFO] got bot: ' + JSON.stringify(bot, null, 2));

    // Load up the PROD alias to get the version
    var botAliases = await lexUtils.listBotAliases(bot.botId);

    console.log('[INFO] got aliases: ' + JSON.stringify(botAliases, null, 2));

    // Find the prod alias
    var prodAlias = botAliases.find(a => a.botAliasName === botAlias);

    // Look for the prod alias
    if (prodAlias === undefined)
    {
      throw new Error('Failed to locate alias: ' + alias);
    }

    console.log('[INFO] got PROD alias: ' + JSON.stringify(prodAlias, null, 2));

    // List the intents for the aliased version and locale
    var intents = await lexUtils.listIntents(bot.botId, prodAlias.botVersion, botLocalId);

    var response = {
      botName: botName,
      fullBotName: qualifiedBotName,
      botId: bot.botId,
      alias: prodAlias.botAliasName,
      botAliasId: prodAlias.botAliasId,
      intents: intents
    };

    console.log('[INFO] described lex bot: ' + JSON.stringify(response, null, 2));

    return requestUtils.buildSuccessfulResponse({
      lexBot: response
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to describe lex bot', error);
    return requestUtils.buildErrorResponse(error);
  }
};

