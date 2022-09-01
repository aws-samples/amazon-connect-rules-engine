
var AWS = require('aws-sdk');

var fs = require('fs');
const { v4: uuidv4 } = require('uuid');
var crypto = require('crypto');

var lexmodelsv2 = undefined; //new AWS.LexModelsV2();
var lexruntimev2 = undefined; //new AWS.LexRuntimeV2();
var cloudWatchLogs = undefined;
var s3 = undefined;

/**
 * Called by the main function to deploy a bot.
 * This function first checks to see if a bot exists and
 * creates it if if doesn't exist.
 * Then updates each intent and finally builds and publishes
 * it if there have been changes.
 */
async function deployBot(botConfig, envConfig)
{
  try
  {
    botConfig.status = {
      fullBotName: getBotName(botConfig, envConfig)
    };

    console.log(`[INFO] deploying bot: ${botConfig.status.fullBotName} - ${botConfig.localeId} (${botConfig.voice} - ${botConfig.engine})`);

    // Check for duplicate data etc
    verifyBotConfig(botConfig);

    var bot = await getBot(botConfig, envConfig);
    var created = false;

    if (bot === undefined)
    {
      bot = await createBot(botConfig, envConfig);
      created = true;
    }

    botConfig.status.created = created;
    botConfig.status.botId = bot.botId;

    if (!await isBotLocaleAvailable(botConfig, envConfig))
    {
      await createBotLocale(botConfig, envConfig);
    }

    // Update slot types
    await updateSlotTypes(botConfig, envConfig);

    // Update intents
    await updateIntents(botConfig, envConfig);

    // Prune any dangling slot types
    await pruneDanglingSlotTypes(botConfig, envConfig);

    // Prune any dangling intents
    await pruneDanglingIntents(botConfig, envConfig);

    // Build the bot and create a new version
    await buildBot(botConfig, envConfig);

    // Create a new bot version
    var botVersion = await createBotVersion(botConfig, envConfig);
    botConfig.status.botVersion = botVersion.botVersion;

    // Update the dev alias
    console.info('[INFO] Updating the test alias');
    await updateAlias('DRAFT', 'TestBotAlias', botConfig, envConfig);

    // Create or update the alias
    var challengerAliasId = await updateAlias(botVersion.botVersion, botConfig.challengerAlias, botConfig, envConfig);
    botConfig.status.challengerAliasId = challengerAliasId;

    if (created)
    {
      console.info('[INFO] bot created successfully');
    }
    else
    {
      console.info('[INFO] bot updated successfully');
    }

    // Test the bot
    await testBot(botConfig, envConfig);

    // If testing succeeds deploy the production alias
    console.info('[INFO] tests passed, deploying the production alias: ' + botConfig.productionAlias);
    var productionAliasId = await updateAlias(botVersion.botVersion, botConfig.productionAlias, botConfig, envConfig);
    botConfig.status.productionAliasId = productionAliasId;
    console.info('[INFO] production alias deployed successfully');

    console.info('[INFO] granting access to Connect instance');
    var lexBotArn = createBotAliasArn(envConfig.region, envConfig.accountNumber, botConfig.status.botId, botConfig.status.productionAliasId);
    await grantConnectAccess(envConfig.accountNumber, envConfig.connectInstanceArn, lexBotArn);
    console.info('[INFO] access granted to Connect instance');

    console.info('[INFO] start pruning bot versions');
    await pruneBotVersions(botConfig);
    console.info('[INFO] done pruning bot versions');
  }
  catch (error)
  {
    throw error;
  }
}

/**
 * Checks to see if we need to deploy
 */
async function checkDeployRequired(botConfig, envConfig, newHash, force)
{
  if (force === true)
  {
    console.info(`[INFO] force mode is enabled, forcing a new deployment`);
    return true;
  }

  var hashKey = `lex/${envConfig.service}/${envConfig.stage}/${botConfig.name}.hash`;

  if (await checkExists(envConfig.deploymentBucket, hashKey))
  {
    var existingHash = await getObject(envConfig.deploymentBucket, hashKey);

    if (existingHash !== newHash)
    {
      console.info(`[INFO] hash does not match previous hash, new deployment is required`);
      return true;
    }
    else
    {
      console.info(`[INFO] hash matches previous deployment, no deployment is required`);
      return false;
    }
  }
  else
  {
    console.info(`[INFO] hash doesn't exist: s3://${envConfig.deploymentBucket}/${hashKey} bot deployment is required`);
    return true;
  }
}

/**
 * Saves the hash to S3 for later checking
 */
async function saveHash(botConfig, envConfig, newHash)
{
  var hashKey = `lex/${envConfig.service}/${envConfig.stage}/${botConfig.name}.hash`;
  await putObject(envConfig.deploymentBucket, hashKey, newHash);
  console.info(`[INFO] saved bot hash to: s3://${envConfig.deploymentBucket}/${hashKey}`);
}

/**
 * Lists the draft intents
 */
async function listDraftIntents(botConfig, envConfig)
{
  try
  {
    var request =
    {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId,
      maxResults: 100
    };

    var draftIntents = [];

    var response = await lexmodelsv2.listIntents(request).promise();

    response.intentSummaries.forEach(summary =>
    {
      if (summary.intentName !== 'FallbackIntent')
      {
        draftIntents.push(summary);
      }
    });

    while (response.nextToken)
    {
      request.nextToken = response.nextToken;

      response = await lexmodelsv2.listIntents(request).promise();

      response.intentSummaries.forEach(summary =>
      {
        if (summary.intentName !== 'FallbackIntent')
        {
          draftIntents.push(summary);
        }
      });
    }

    draftIntents.sort(function (a, b) {
      return a.intentName.localeCompare(b.intentName);
    });

    return draftIntents;
  }
  catch (error)
  {
    console.error('[ERROR] failed to list draft intents: ' + error.message);
    throw error;
  }
}

/**
 * Intents can be created externally or added then removed from bot configs
 * these need to be removed prior to build.
 */
async function pruneDanglingIntents(botConfig, envConfig)
{
  try
  {
    var expectedIntentNames = [];

    botConfig.intents.forEach(intent =>
    {
      expectedIntentNames.push(intent.name);
    });

    expectedIntentNames.sort();

    var draftIntents = await listDraftIntents(botConfig, envConfig);

    var danglingIntents = [];

    draftIntents.forEach(draftIntent =>
    {
      if (!expectedIntentNames.includes(draftIntent.intentName))
      {
        danglingIntents.push(draftIntent);
      }
    });

    for (var i = 0; i < danglingIntents.length; i++)
    {
      console.info(`[INFO] deleting dangling intent: ${danglingIntents[i].intentName}`);

      var request =
      {
        botId: botConfig.status.botId,
        botVersion: 'DRAFT',
        intentId: danglingIntents[i].intentId,
        localeId: botConfig.localeId
      };

      var deleteIntentAction = async () =>
      {
        await lexmodelsv2.deleteIntent(request).promise();
      };

      await retryableLexV2Action(deleteIntentAction, 'Delete intent');
    }
  }
  catch (error)
  {
    console.error('[ERROR] failed to delete dangling intent: ' + error.message);
    throw error;
  }
}

/**
 * Delete any dangling slotTypes
 */
async function pruneDanglingSlotTypes(botConfig, envConfig)
{
  try
  {
    var slotTypeNames = Object.keys(botConfig.status.slotTypes);

    // Find any existing slot types with no slot config and delete them
    for (var i = 0; i < slotTypeNames.length; i++)
    {
      var slotType = botConfig.status.slotTypes[slotTypeNames[i]];
      var slotTypeConfig = botConfig.slots.find(stc => stc.name === slotType.name);

      if (slotTypeConfig === undefined)
      {
        console.info(`[INFO] deleting dangling slot type: ${slotType.name}`)
        await deleteSlotType(slotType, botConfig, envConfig);
        // Remove this slot type from our list
        botConfig.status.slotTypes[slotTypeNames[i]] = undefined;
      }
    }
  }
  catch (error)
  {
    console.error(`[ERROR] failed to prune dangling slot types: ${error.message}`);
    throw error;
  }
}

/**
 * Verifies bot config detecting duplicate utterances and intent names
 */
function verifyBotConfig(botConfig)
{
  var uniqueSlotNames = new Set();
  var uniqueSlotValues = new Set();
  var uniqueIntentNames = new Set();
  var uniqueUtterances = new Set();

  botConfig.slots.forEach(slot =>
  {
    var normalisedSlotName = slot.name.toLowerCase();

    if (uniqueSlotNames.has(normalisedSlotName))
    {
      throw new Error('Duplicate slot name found: ' + slot.name);
    }

    uniqueSlotNames.add(normalisedSlotName);

    // Make sure we aren't mixing built in slot types with custom enumerated slots
    if (slot.parentType !== undefined)
    {
      if (slot.values !== undefined && slot.values.length > 0)
      {
        throw new Error(`Invalid slot found: ${slot.name} with slot values and parent type: ${slot.parentType}`);
      }

      if (slot.prompt === undefined)
      {
        throw new Error(`Invalid slot found: ${slot.name} with parent type: ${slot.parentType} missing required prompt`);
      }
    }
    else
    {
      slot.values.forEach(value =>
      {
        var normalisedSlotValue = undefined;

        // If its got a name, then normalise the name,
        // other wise try and normalise the value (original vs top)
        if (value.name)
        {
          normalisedSlotValue = value.name.toLowerCase();
        }
        else
        {
          normalisedSlotValue = value.toLowerCase();
        }

        if (uniqueSlotValues.has(normalisedSlotValue))
        {
          throw new Error(`Duplicate slot value found: ${value} on slot: ${slot.name}`);
        }

        // Check for duplicate slot synonyms
        if (value.synonyms !== undefined && Array.isArray(value.synonyms))
        {
          value.synonyms.forEach(synonym =>
          {
            var normalisedSynonym = synonym.toLowerCase();

            if (uniqueSlotValues.has(normalisedSynonym))
            {
              throw new Error(`Duplicate slot synonym found: ${synonym} on slot: ${slot.name}`);
            }

            uniqueSlotValues.add(normalisedSynonym);
          });
        }
      });
    }
  });

  botConfig.intents.forEach(intent =>
  {
    var normalisedIntentName = intent.name.toLowerCase();

    if (uniqueIntentNames.has(normalisedIntentName))
    {
      throw new Error('Duplicate intent name found: ' + intent.name);
    }

    uniqueIntentNames.add(normalisedIntentName);

    intent.utterances.forEach(utterance => {
      var normalisedUtterance = utterance.toLowerCase();

      if (uniqueUtterances.has(normalisedUtterance))
      {
        throw new Error(`Duplicate utterance found: ${utterance} on intent: ${intent.name}`);
      }

      uniqueUtterances.add(normalisedUtterance);
    });
  });

  botConfig.status.verified = true;
}

/**
 * Updates the requested alias to point to the requested built version
 */
async function updateAlias(botVersion, alias, botConfig, envConfig)
{
  try
  {
    console.info('[INFO] updating alias: ' + alias);

    var existingAliases = await listBotAliases(botConfig, envConfig);

    var existingAlias = existingAliases.find(a => a.botAliasName === alias);

    if (existingAlias === undefined)
    {
      console.info('[INFO] alias not found, creating: ' + alias);
      var aliasDescription = await createBotAlias(botVersion, alias, botConfig, envConfig);
      return aliasDescription.botAliasId;
    }
    else
    {
      console.info('[INFO] alias found, updating: ' + alias);
      await updateBotAlias(botVersion, existingAlias.botAliasId, alias, botConfig, envConfig);
      return existingAlias.botAliasId;
    }

  }
  catch (error)
  {
    console.error('[ERROR] failed to update bot alias: ' + error.message);
    throw error;
  }
}

/**
 * Creates a bot alias from a bot version waiting for it to be ready
 */
async function createBotAlias(botVersion, botAlias, botConfig, envConfig)
{
  try
  {
    var request =
    {
      botAliasName: botAlias,
      botId: botConfig.status.botId,
      botAliasLocaleSettings: {},
      botVersion: botVersion,
      description: botConfig.description,
      sentimentAnalysisSettings:
      {
        detectSentiment: botConfig.detectSentiment
      }
    };

    request.botAliasLocaleSettings[botConfig.localeId] =
    {
      enabled: true
    };

    if (envConfig.fulfillmentFunctionArn !== undefined)
    {
      console.info(`[INFO] enabling lambda code hook on alias: ${botAlias}`);

      request.botAliasLocaleSettings[botConfig.localeId].codeHookSpecification =
      {
        lambdaCodeHook: {
          lambdaARN: envConfig.fulfillmentFunctionArn,
          codeHookInterfaceVersion: '1.0'
        }
      };
    }

    // Set up logging if this is the production alias
    await setupLogging(request, botAlias, botConfig, envConfig);

    var createBotAliasAction = async() =>
    {
      return await lexmodelsv2.createBotAlias(request).promise();
    };

    var response = await retryableLexV2Action(createBotAliasAction, 'Create bot alias');

    await sleepFor(2000);

    var aliasDescription = await describeBotAlias(response.botAliasId, botConfig, envConfig);

    while (aliasDescription.botAliasStatus !== 'Available' &&
      aliasDescription.botAliasStatus !== 'Failed')
    {
      console.info('[INFO] waiting for bot alias to create, status: ' + aliasDescription.botAliasStatus);
      await sleepFor(2000);
      aliasDescription = await describeBotAlias(response.botAliasId, botConfig, envConfig);
    }

    if (aliasDescription.botAliasStatus !== 'Available')
    {
      throw new Error('Bot alias did not create cleanly, status: ' + aliasDescription.botAliasStatus);
    }

    return aliasDescription;
  }
  catch (error)
  {
    console.error('[ERROR] failed to create bot alias: ' + error.message);
    throw error;
  }
}

/**
 * Creates a bot alias from a bot version wwaiting for it to be ready
 */
async function updateBotAlias(botVersion, botAliasId, botAlias, botConfig, envConfig)
{
  try
  {
    var request =
    {
      botAliasId: botAliasId,
      botAliasName: botAlias,
      botId: botConfig.status.botId,
      botAliasLocaleSettings: {},
      botVersion: botVersion,
      description: botConfig.description,
      sentimentAnalysisSettings:
      {
        detectSentiment: botConfig.detectSentiment
      }
    };

    request.botAliasLocaleSettings[botConfig.localeId] =
    {
      enabled: true
    };

    if (envConfig.fulfillmentFunctionArn !== undefined)
    {
      console.info(`[INFO] enabling lambda code hook on alias: ${botAlias}`);

      request.botAliasLocaleSettings[botConfig.localeId].codeHookSpecification =
      {
        lambdaCodeHook: {
          lambdaARN: envConfig.fulfillmentFunctionArn,
          codeHookInterfaceVersion: '1.0'
        }
      };
    }

    // Set up logging if this is the production alias
    await setupLogging(request, botAlias, botConfig, envConfig);

    var updateBotAliasAction = async() =>
    {
      return await lexmodelsv2.updateBotAlias(request).promise();
    };

    var response = await retryableLexV2Action(updateBotAliasAction, 'Update bot alias');

    await sleepFor(2000);

    var aliasDescription = await describeBotAlias(botAliasId, botConfig, envConfig);

    while (aliasDescription.botAliasStatus !== 'Available' &&
      aliasDescription.botAliasStatus !== 'Failed')
    {
      console.info('[INFO] waiting for bot alias to update, status: ' + aliasDescription.botAliasStatus);
      await sleepFor(2000);
      aliasDescription = await describeBotAlias(botAliasId, botConfig, envConfig);
    }

    if (aliasDescription.botAliasStatus !== 'Available')
    {
      throw new Error('Bot alias did not update cleanly, status: ' + aliasDescription.botAliasStatus);
    }

    return aliasDescription;
  }
  catch (error)
  {
    console.error('[ERROR] failed to update bot alias: ' + error.message);
    throw error;
  }
}

/**
 * Sets up cloud watch and S3 logging if required for the production alias
 */
async function setupLogging(request, botAlias, botConfig, envConfig)
{
  try
  {
    // If this is the production alias enable cloud watch and S3 conversational logging
    if (botAlias === botConfig.productionAlias)
    {
      var logGroupName = `/aws/lex/${botConfig.status.fullBotName}`;
      var cloudWatchArn = `arn:aws:logs:${envConfig.region}:${envConfig.accountNumber}:log-group:${logGroupName}`;
      var s3LogPrefix = `/aws/lex/${botConfig.status.fullBotName}`;
      var cloudWatchLogPrefix = botAlias;

      request.conversationLogSettings =
      {
        audioLogSettings:
        [
          {
            destination: {
              s3Bucket: {
                logPrefix: s3LogPrefix,
                s3BucketArn: envConfig.conversationalLogsBucketArn
              }
            },
            enabled: true
          }
        ],
        textLogSettings:
        [
          {
            destination: {
              cloudWatch: {
                cloudWatchLogGroupArn: cloudWatchArn,
                logPrefix: cloudWatchLogPrefix
              }
            },
            enabled: true
          }
        ]
      };

      botConfig.status.cloudWatchLogGroup = logGroupName;
      botConfig.status.cloudWatchLogArn = cloudWatchArn;
      botConfig.status.cloudWatchLogPrefix = cloudWatchLogPrefix;
      botConfig.status.s3LogBucket = envConfig.conversationalLogsBucketArn;
      botConfig.status.s3LogPrefix = s3LogPrefix;

      await createLogGroup(logGroupName);

      console.info('[INFO] enabling conversational logging for production alias');
    }
  }
  catch (error)
  {
    console.error('[ERROR] failed to set up logging', error);
    throw error;
  }
}

/**
 * Creates a log group if it doesn't exist
 */
async function createLogGroup(logGroupName)
{
  try
  {
    console.info('[INFO] checking log group status: ' + logGroupName);

    var listRequest = {
      limit: 50,
      logGroupNamePrefix: logGroupName
    };

    var exists = false;

    var logGroups = [];

    var listResponse = await cloudWatchLogs.describeLogGroups(listRequest).promise();
    logGroups = logGroups.concat(listResponse.logGroups);

    while (listResponse.nextToken !== undefined && listResponse.nextToken !== null)
    {
      listRequest.nextToken = listResponse.nextToken;
      listResponse = await cloudWatchLogs.describeLogGroups(listRequest).promise();
      logGroups = logGroups.concat(listResponse.logGroups);
    }

    if (logGroups.length === 0)
    {
      console.info('[INFO] log group is missing, creating: ' + logGroupName);
      var createRequest = {
        logGroupName: logGroupName
      };

      var createResponse = await cloudWatchLogs.createLogGroup(createRequest).promise();

      console.info('[INFO] created log group successfully: ' + logGroupName);
    }
    else
    {
      console.info('[INFO] log group already exists, skipping creating: ' + logGroupName);
    }
  }
  catch (error)
  {
    console.error('[ERROR] failed to create log group', error);
    throw error;
  }
}

/**
 * Describes a bot alias
 */
async function listBotAliases(botConfig, envConfig)
{
  var listBotAliasesAction = async () =>
  {
    var request =
    {
      botId: botConfig.status.botId
    };

    var response = await lexmodelsv2.listBotAliases(request).promise();
    return response.botAliasSummaries;
  };

  return await retryableLexV2Action(listBotAliasesAction, 'List bot aliases');
}

/**
 * Updates all intents
 */
async function updateIntents(botConfig, envConfig)
{
  try
  {
    var intents = await listIntents(botConfig, envConfig);

    // Make sure all intents are created first
    for (var i = 0; i < botConfig.intents.length; i++)
    {
      var intentConfig = botConfig.intents[i];
      var existingIntent = intents.find(intent => intent.intentName === intentConfig.name);

      if (existingIntent === undefined)
      {
        console.info('[INFO] creating missing intent: ' + intentConfig.name);
        var intentId = await createIntent(intentConfig, botConfig, envConfig);
        console.info('[INFO] missing intent created: ' + intentConfig.name);
      }
    }

    intents = await listIntents(botConfig, envConfig);

    var fallbackIntent = intents.find(intent => intent.intentName === 'FallbackIntent');

    if (fallbackIntent !== undefined)
    {
      console.info('[INFO] updating fallback intent: ' + JSON.stringify(fallbackIntent, null, 2));
      await updateFallbackIntent(fallbackIntent, botConfig, envConfig);
    }

    // Update each intent
    for (var i = 0; i < botConfig.intents.length; i++)
    {
      var intentConfig = botConfig.intents[i];

      var existingIntent = intents.find(intent => intent.intentName === intentConfig.name);

      if (existingIntent === undefined)
      {
        throw new Error('Failed to find intent: ' + intentConfig.name);
      }

      var existingSlots = await listSlots(existingIntent, intentConfig, botConfig, envConfig);
      var referencedSlots = findReferencedSlotNames(intentConfig, botConfig, envConfig);

      /**
       * Find slots we need to delete
       */
      for (var e = 0; e < existingSlots.length; e++)
      {
        var existingIntentSlot = existingSlots[e];
        var referencedSlot = referencedSlots.find(slotName => slotName === existingIntentSlot.slotName);

        if (referencedSlot === undefined)
        {
          console.info(`[INFO] deleting dangling slot: ${existingIntentSlot.slotName} on intent: ${intentConfig.name}`);
          await deleteIntentSlot(existingIntentSlot, existingIntent, intentConfig, botConfig, envConfig);
        }
      }

      /**
       * Find slots we need to create and update
       */
      for (var s = 0; s < referencedSlots.length; s++)
      {
        var referencedSlot = referencedSlots[s];

        console.info(`[INFO] Checking referenced slot: ${referencedSlot} on intent: ${intentConfig.name}`);

        var slotConfig = botConfig.slots.find(slot => slot.name === referencedSlot);

        if (slotConfig === undefined)
        {
          throw new Error(`Failed to find slot: ${referencedSlot} on intent: ${intentConfig.name}`);
        }

        // Fail hard if we we see a referenced slot with no slot type config
        if (slotConfig === undefined)
        {
          throw new Error(`Failed to find slot config for referenced slot: ${referencedSlot} on intent: ${intentConfig.name}`);
        }

        var slotType = botConfig.status.slotTypes[referencedSlot];
        var existingSlot = existingSlots.find(existingSlot => existingSlot.slotName === referencedSlot);

        // Create missing intent slots for referenced slots
        if (existingSlot === undefined)
        {
          console.info(`[INFO] did not find existing slot: ${referencedSlot} must be created for intent: ${intentConfig.name}`);
          await createIntentSlot(slotType, slotConfig, existingIntent, intentConfig, botConfig, envConfig);
        }
        else
        {
          console.info(`[INFO] found existing slot: ${referencedSlot} updating for intent: ${intentConfig.name}`);
          await updateIntentSlot(existingSlot, slotType, slotConfig, existingIntent, intentConfig, botConfig, envConfig);
        }
      }

      existingSlots = await listSlots(existingIntent, intentConfig, botConfig, envConfig);

      console.info('[INFO] updating intent: ' + intentConfig.name);
      await updateIntent(existingIntent, existingSlots, intentConfig, botConfig, envConfig);
    }
  }
  catch (error)
  {
    console.error('[ERROR] failed to check intents: ' + error.message);
    throw error;
  }
}

/**
 * Deletes a slot type that we found that is no longer in use
 */
async function deleteSlotType(slotType, botConfig, envConfig)
{
  var deleteIntentSlotTypeAction = async () =>
  {
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId,
      slotTypeId: slotType.id
    };

    await lexmodelsv2.deleteSlotType(request).promise();
  };

  await retryableLexV2Action(deleteIntentSlotTypeAction, 'Delete slot type');
}

/**
 * Deletes an existing intent slot
 */
async function deleteIntentSlot(existingIntentSlot, existingIntent, intentConfig, botConfig, envConfig)
{
  var deleteIntentSlotAction = async () =>
  {
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId,
      intentId: existingIntent.intentId,
      slotId: existingIntentSlot.slotId
    };

    await lexmodelsv2.deleteSlot(request).promise();
  };

  await retryableLexV2Action(deleteIntentSlotAction, 'Delete intent slot');
}

/**
 * Updates an intent sloton the requested intent
 */
async function updateIntentSlot(existingIntentSlot, slotType, slotConfig, existingIntent, intentConfig, botConfig, envConfig)
{
  var updateIntentSlotAction = async () =>
  {
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId,
      intentId: existingIntent.intentId,
      slotName: slotConfig.name,
      slotTypeId: slotConfig.parentType !== undefined ? slotConfig.parentType : slotType.id,
      slotId: existingIntentSlot.slotId,
      valueElicitationSetting:
      {
        slotConstraint: slotConfig.required === true ? 'Required' : 'Optional'
      }
    };

    // If we have a prompt use it
    if (slotConfig.prompt !== undefined)
    {
      request.valueElicitationSetting.promptSpecification = {
        maxRetries: 0,
        allowInterrupt: true,
        messageGroups: [
          {
            message:
            {
              plainTextMessage:
              {
                value: slotConfig.prompt
              }
            }
          }
        ]
      };
    }

    await lexmodelsv2.updateSlot(request).promise();
  };

  await retryableLexV2Action(updateIntentSlotAction, 'Update intent slot');
}

/**
 * Creates a slot on the requested intent
 */
async function createIntentSlot(slotType, slotConfig, existingIntent, intentConfig, botConfig, envConfig)
{
  var createIntentSlotAction = async() =>
  {
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId,
      intentId: existingIntent.intentId,
      slotName: slotConfig.name,
      slotTypeId: slotConfig.parentType !== undefined ? slotConfig.parentType : slotType.id,
      valueElicitationSetting:
      {
        slotConstraint: slotConfig.required === true ? 'Required' : 'Optional'
      }
    };

    // If we have a prompt use it
    if (slotConfig.prompt !== undefined)
    {
      request.valueElicitationSetting.promptSpecification = {
        maxRetries: 0,
        allowInterrupt: true,
        messageGroups: [
          {
            message:
            {
              plainTextMessage:
              {
                value: slotConfig.prompt
              }
            }
          }
        ]
      };
    }

    await lexmodelsv2.createSlot(request).promise();
  };

  await retryableLexV2Action(createIntentSlotAction, 'Create intent slot');
}

/**
 * Builds a bot
 */
async function buildBot(botConfig, envConfig)
{
  var buildBotLocaleAction = async() =>
  {
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId
    };

    await lexmodelsv2.buildBotLocale(request).promise();
  };

  await retryableLexV2Action(buildBotLocaleAction, 'Build bot locale');

  var botLocale = await describeBotLocale(botConfig, envConfig);

  while (botLocale.botLocaleStatus !== 'Built' &&
    botLocale.botLocaleStatus !== 'Failed')
  {
    console.info('[INFO] waiting for bot to build, status: ' + botLocale.botLocaleStatus);
    await sleepFor(5000);
    botLocale = await describeBotLocale(botConfig, envConfig);
  }

  if (botLocale.botLocaleStatus !== 'Built')
  {
    console.error(`[ERROR] bot build failure detected: ${JSON.stringify(botLocale, null, 2)}`);
    throw new Error('Failed to build bot, found bot locale status: ' + botLocale.botLocaleStatus);
  }
};

/**
 * Creates a bot version waiting for ready
 */
async function createBotVersion(botConfig, envConfig)
{
  var createBotVersionAction = async() =>
  {
    var createVersionRequest = {
      botId: botConfig.status.botId,
      botVersionLocaleSpecification: {},
      description: botConfig.description
    };

    createVersionRequest.botVersionLocaleSpecification[botConfig.localeId] =
    {
      sourceBotVersion: 'DRAFT'
    };

    var createVersionResponse = await lexmodelsv2.createBotVersion(createVersionRequest).promise();

    await sleepFor(5000);

    var botVersionDescription = await describeBotVersion(createVersionResponse.botVersion, botConfig, envConfig);

    while (botVersionDescription.botStatus !== 'Available' &&
            botVersionDescription.botStatus !== 'Failed')
    {
      await sleepFor(5000);
      botVersionDescription = await describeBotVersion(createVersionResponse.botVersion, botConfig, envConfig);
    }

    if (botVersionDescription.botStatus !== 'Available')
    {
      throw new Error('Failed to create bot version, found bot version status: ' + botVersionDescription.botStatus);
    }

    return botVersionDescription;
  };

  return await retryableLexV2Action(createBotVersionAction, 'Create bot version');
}

/**
 * Describes a bot alias for a version
 */
async function describeBotAlias(botAliasId, botConfig, envConfig)
{
  var describeBotAliasAction = async () =>
  {
    var request = {
      botId: botConfig.status.botId,
      botAliasId: botAliasId
    };

    return await lexmodelsv2.describeBotAlias(request).promise();
  };

  return await retryableLexV2Action(describeBotAliasAction, 'Describe bot alias');
}

/**
 * Describes a bot version
 */
async function describeBotVersion(botVersion, botConfig, envConfig)
{
  var describeBotVersionAction = async() =>
  {
    var describeBotVersionRequest = {
      botId: botConfig.status.botId,
      botVersion: botVersion
    };

    var describeBotVersionResponse = await lexmodelsv2.describeBotVersion(describeBotVersionRequest).promise();

    return describeBotVersionResponse;
  };

  return retryableLexV2Action(describeBotVersionAction, 'Describe bot version');
}

/**
 * Updates the fallback intent in Lex
 */
async function updateFallbackIntent(existingIntent, botConfig, envConfig)
{
  var updateIntentAction = async() =>
  {
    var request = {
      botId: botConfig.status.botId,
      intentId: existingIntent.intentId,
      botVersion: 'DRAFT',
      parentIntentSignature: 'AMAZON.FallbackIntent',
      intentName: existingIntent.intentName,
      description: existingIntent.description,
      localeId: botConfig.localeId,
      fulfillmentCodeHook: {
        enabled: envConfig.fulfillmentFunctionArn !== undefined
      }
    };

    console.info(`[INFO] updating fallback intent with: ${JSON.stringify(request, null, 2)}`)

    await lexmodelsv2.updateIntent(request).promise();
  };

  await retryableLexV2Action(updateIntentAction, 'Update fallback intent');
};

/**
 * Updates the intent in Lex
 */
async function updateIntent(existingIntent, existingSlots, intentConfig, botConfig, envConfig)
{
  var updateIntentAction = async() =>
  {
    var request = {
      botId: botConfig.status.botId,
      intentId: existingIntent.intentId,
      botVersion: 'DRAFT',
      intentName: intentConfig.name,
      description: intentConfig.description,
      localeId: botConfig.localeId,
      sampleUtterances: [],
      slotPriorities: [],
      fulfillmentCodeHook: {
        enabled: envConfig.fulfillmentFunctionArn !== undefined
      }
    };

    intentConfig.utterances.forEach(utterance =>
    {
      request.sampleUtterances.push({
        utterance: utterance
      });
    });

    for (var i = 0; i < existingSlots.length; i++)
    {
      request.slotPriorities.push({
        priority: i,
        slotId: existingSlots[i].slotId
      });
    }

    await lexmodelsv2.updateIntent(request).promise();
  };

  await retryableLexV2Action(updateIntentAction, 'Update intent');
};

/**
 * Fetches the bot name in the format: <stage>-<bot name>
 */
function getBotName(botConfig, envConfig)
{
  return `${envConfig.stage}-${envConfig.service}-${botConfig.name}`;
}

/**
 * Look up a bot and get its status
 */
async function getBot(botConfig, envConfig)
{
  var listBotsAction = async () =>
  {
    var params = {
      filters: [
        {
          name: 'BotName',
          operator: 'EQ',
          values: [
            botConfig.status.fullBotName
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

    console.info('[INFO] no existing bot found for name: ' + botConfig.status.fullBotName);
    return undefined;
  };

  return await retryableLexV2Action(listBotsAction, 'List bots');
}

/**
 * Checks for existing slot types and either creates or updates the slot types
 */
async function updateSlotTypes(botConfig, envConfig)
{
  try
  {
    var slotTypes = await listSlotTypes(botConfig, envConfig);

    // Make sure all slot types are created first
    for (var i = 0; i < botConfig.slots.length; i++)
    {
      var slotConfig = botConfig.slots[i];

      if (slotConfig.parentType === undefined)
      {
        var existingSlotType = slotTypes.find(slotType => slotType.slotTypeName === slotConfig.name);

        if (existingSlotType === undefined)
        {
          console.info('[INFO] creating missing slot type: ' + slotConfig.name);
          await createSlotType(slotConfig, botConfig, envConfig);
        }
      }
    }

    slotTypes = await listSlotTypes(botConfig, envConfig);

    // Record the slot ids
    botConfig.status.slotTypes = {};

    slotTypes.forEach(slotType => {
      botConfig.status.slotTypes[slotType.slotTypeName] = {
        name: slotType.slotTypeName,
        id: slotType.slotTypeId,
        description: slotType.description
      }
    });

    // Update the slot types
    for (var i = 0; i < botConfig.slots.length; i++)
    {
      var slotConfig = botConfig.slots[i];

      if (slotConfig.parentType === undefined)
      {
        var existingSlotType = slotTypes.find(slotType => slotType.slotTypeName === slotConfig.name);

        if (existingSlotType === undefined)
        {
          console.error(`[ERROR] failed to find slot type: ${slotConfig.name} on intent: ${intentConfig.name}`);
          throw new Error('Failed to find slot type: ' + slotConfig.name);
        }

        await updateSlotType(existingSlotType, slotConfig, botConfig, envConfig);
      }
    }
  }
  catch (error)
  {
    console.error(`[ERROR] failed to update slot types cause: ${error.message}`);
    throw error;
  }
}

/**
 * Infers a resolution strategy from a slot config
 */
function inferResolutionStrategy(slotConfig)
{
  // If they are all slots are strings, then assume original
  if (slotConfig.values.every(value => (typeof value === "string")))
  {
    return "OriginalValue";
  }

  return "TopResolution"
}

/**
 * Create a slot type
 */
async function createSlotType(slotConfig, botConfig, envConfig)
{
  var createSlotTypeAction = async() =>
  {
    var resolutionStrategy = inferResolutionStrategy(slotConfig);
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId,
      slotTypeName: slotConfig.name,
      description: slotConfig.description,
      slotTypeValues: [],
      valueSelectionSetting: {
        resolutionStrategy: resolutionStrategy
      }
    };

    slotConfig.values.forEach(value => {
      if(resolutionStrategy === "OriginalValue"){
        var slotValue = {
          sampleValue: {
            value: value
          }
        };
      }
      else {
        var slotValue = {
          sampleValue: {
            value: value.name.toLowerCase()
          }
        };
        if (value.synonyms !== undefined && Array.isArray(value.synonyms))
        {
          slotValue.synonyms = [];

          value.synonyms.forEach(synonym =>
          {
            slotValue.synonyms.push(
            {
              value: synonym.toLowerCase()
            });
          });
        }

      }
      request.slotTypeValues.push(slotValue);
    });

    await lexmodelsv2.createSlotType(request).promise();
  };

  await retryableLexV2Action(createSlotTypeAction, 'Create slot type');

}

/**
 * Given an intent config, look through it's utterances for any
 * referenced slots
 */
function findReferencedSlotNames(intentConfig, botConfig, envConfig)
{
  var slots = new Set();

  var re = /{(.*?)}/g;

  for (var j = 0; j < intentConfig.utterances.length; j++)
  {
    var utterance = intentConfig.utterances[j];

    var matches = re.exec(utterance);

    while (matches !== null)
    {
      slots.add(matches[1]);
      matches = re.exec(utterance);
    }
  }

  var slotNames = Array.from(slots);
  slotNames.sort();

  if (slotNames.length > 0)
  {
    console.info(`[INFO] found slot names: ${JSON.stringify(slotNames)} for intent: ${intentConfig.name}`);
  }
  else
  {
    console.info(`[INFO] no slot names found in utterances for intent: ${intentConfig.name}`);
  }
  return slotNames;
}

/**
 * Lists the slots for an existing intent
 */
async function listSlots(existingIntent, intentConfig, botConfig, envConfig)
{
  var listSlotTypesAction = async() =>
  {
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId,
      intentId: existingIntent.intentId
    };

    var response = await lexmodelsv2.listSlots(request).promise();

    var summaries = response.slotSummaries;

    summaries.sort(function (a, b)
    {
      return a.slotName.localeCompare(b.slotName);
    });

    return summaries;
  };

  return await retryableLexV2Action(listSlotTypesAction, 'List slots');
}

/**
 * Lists the slot types for a bot
 */
async function listSlotTypes(botConfig, envConfig)
{
  var listSlotTypesAction = async() =>
  {
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId,
      maxResults: 1000 //this must of defaulted to 10
    };

    var response = await lexmodelsv2.listSlotTypes(request).promise();
    return response.slotTypeSummaries;
  };

  return retryableLexV2Action(listSlotTypesAction, 'List slot types');
}

/**
 * Updates a slot type for a bot
 */
async function updateSlotType(existingSlotType, slotConfig, botConfig, envConfig)
{
  var updateSlotTypeAction = async() =>
  {
    var resolutionStrategy = inferResolutionStrategy(slotConfig);
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId,
      slotTypeId: botConfig.status.slotTypes[slotConfig.name].id,
      slotTypeName: slotConfig.name,
      description: slotConfig.description,
      slotTypeValues: [],
      valueSelectionSetting: {
        resolutionStrategy: resolutionStrategy
      }
    };

    slotConfig.values.forEach(value => {
      if(resolutionStrategy === "OriginalValue"){
        var slotValue = {
          sampleValue: {
            value: value
          }
        };;
      }
      else {
        var slotValue = {
          sampleValue: {
            value: value.name.toLowerCase()
          }
        };
        if (value.synonyms !== undefined && Array.isArray(value.synonyms))
        {
          slotValue.synonyms = [];

          value.synonyms.forEach(synonym =>
          {
            slotValue.synonyms.push(
            {
              value: synonym.toLowerCase()
            });
          });
        }
      }
      request.slotTypeValues.push(slotValue);
    });

    await lexmodelsv2.updateSlotType(request).promise();
  };

  await retryableLexV2Action(updateSlotTypeAction, 'Update slot type');
}

/**
 * Creates an intent
 */
async function createIntent(intentConfig, botConfig, envConfig)
{
  var createIntentAction = async () =>
  {
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      intentName: intentConfig.name,
      description: intentConfig.description,
      localeId: botConfig.localeId,
      fulfillmentCodeHook: {
        enabled: envConfig.fulfillmentFunctionArn !== undefined
      }
    };

    var response = await lexmodelsv2.createIntent(request).promise();
    return response.intentId;
  };

  return await retryableLexV2Action(createIntentAction, 'Create intent');
}

/**
 * Creates a bot locale
 */
async function createBotLocale(botConfig, envConfig)
{
  var createBotLocaleAction = async () =>
  {
    var createBotLocaleRequest = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId,
      description: botConfig.description,
      nluIntentConfidenceThreshold: botConfig.confidenceThreshold,
      voiceSettings: {
        voiceId: botConfig.voice,
        engine: botConfig.engine
      }
    };

    await lexmodelsv2.createBotLocale(createBotLocaleRequest).promise();
  };

  await retryableLexV2Action(createBotLocaleAction, 'Create bot locale');

  console.info('[INFO] waiting for bot locale creation');

  while (!await isBotLocaleAvailable(botConfig, envConfig))
  {
    await sleepFor(2000);
  }

  console.info('[INFO] bot locale created');

  return describeBot(botConfig, envConfig);
}

/**
 * Creates a Lex bot and a locale
 */
async function createBot(botConfig, envConfig)
{
  var createBotAction = async() =>
  {
    var createBotRequest = {
      botName: botConfig.status.fullBotName,
      dataPrivacy: {
        childDirected: false
      },
      description: botConfig.description,
      idleSessionTTLInSeconds: botConfig.idleSessionTTLInSeconds,
      roleArn: envConfig.lexRoleArn
    };

    var createBotResponse = await lexmodelsv2.createBot(createBotRequest).promise();
    botConfig.status.botId = createBotResponse.botId;
  };

  await retryableLexV2Action(createBotAction, 'Create bot');

  while (!await isBotAvailable(botConfig, envConfig))
  {
    await sleepFor(2000);
  }

  return describeBot(botConfig, envConfig);
}

/**
 * Checks to see if the bot locale is available
 */
async function isBotLocaleAvailable(botConfig, envConfig)
{
  var describeBotLocaleAction = async () =>
  {
    try
    {
      var response = await describeBotLocale(botConfig, envConfig);
    }
    catch (error)
    {
      if (error.code === 'ResourceNotFoundException')
      {
        console.info('[INFO] bot does not exist');
        return false;
      }
      throw error;
    }

    if (response.botLocaleStatus === 'Failed' || response.botLocaleStatus === 'Built' || response.botLocaleStatus === 'NotBuilt')
    {
      console.info('[INFO] bot locale is available with status: ' + response.botLocaleStatus)
      return true;
    }

    console.info('[INFO] bot locale is not yet available: ' + response.botLocaleStatus);
    return false;
  };

  return await retryableLexV2Action(describeBotLocaleAction, 'Describe bot locale');
}

/**
 * Checks to see if the bot is available
 */
async function isBotAvailable(botConfig, envConfig)
{
  var response = await describeBot(botConfig, envConfig);

  if (response.botStatus === 'Available')
  {
    console.info('[INFO] bot is available')
    return true;
  }

  console.info('[INFO] bot is not yet available: ' + response.botStatus);
  return false;
};

/**
 * Describes a lex bot by bot id
 */
async function describeBot(botConfig, envConfig)
{
  var describeBotAction = async () =>
  {
    var request = {
      botId: botConfig.status.botId
    };

    return await lexmodelsv2.describeBot(request).promise();
  };

  return await retryableLexV2Action(describeBotAction, 'Describe bot');
};

/**
 * Describes a bot locale for the DRAFT version
 */
async function describeBotLocale(botConfig, envConfig)
{
  var describeBotLocaleAction = async () =>
  {
    var describeBotLocaleRequest = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId
    };

    try
    {
      return await lexmodelsv2.describeBotLocale(describeBotLocaleRequest).promise();
    }
    catch (error)
    {
      if (error.code === 'ResourceNotFoundException')
      {
        console.info('[INFO] bot does not exist');
        return {};
      }
      throw error;
    }
  };

  return await retryableLexV2Action(describeBotLocaleAction, 'Describe bot locale');
}

/**
 * Lists intents
 */
async function listIntents(botConfig, envConfig)
{
  var listIntentsAction = async () =>
  {
    var request = {
      botId: botConfig.status.botId,
      botVersion: 'DRAFT',
      localeId: botConfig.localeId
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

    return intents;
  }

  return await retryableLexV2Action(listIntentsAction, 'List intents');
}

/**
 * Deletes a lex session
 */
async function deleteSession(sessionId, aliasId, botConfig, envConfig)
{
  var deleteSessionAction = async () =>
  {
    var request = {
      botAliasId: aliasId,
      botId: botConfig.status.botId,
      localeId: botConfig.localeId,
      sessionId: sessionId
    };

    await lexruntimev2.deleteSession(request).promise();
  };

  await retryableLexV2Action(deleteSessionAction, 'Delete session');
}

/**
 * Run all of the tests and verify the results using the challenger alias id
 */
async function testBot(botConfig, envConfig)
{
  var failures = 0;
  var results = [];

  try
  {
    for (var i = 0; i < botConfig.intents.length; i++)
    {
      var intentToTest = botConfig.intents[i];

      console.info('[INFO] testing intent: ' + intentToTest.name);

      var intentResult = {
        intent: intentToTest.name,
        success: 0,
        fail: 0,
        problems: []
      };

      for (var t = 0; t < intentToTest.tests.length; t++)
      {
        var test = intentToTest.tests[t];
        var problemCount = 0;

        var inferenceRequest = {
          botAliasId: botConfig.status.challengerAliasId,
          botId: botConfig.status.botId,
          localeId: botConfig.localeId,
          sessionId: 'test-' + uuidv4(),
          text: test.utterance
        };

        var inferenceResponse = await lexruntimev2.recognizeText(inferenceRequest).promise();

        await deleteSession(inferenceRequest.sessionId, botConfig.status.challengerAliasId, botConfig, envConfig);

        var interpretation = inferenceResponse.interpretations[0];

        if (interpretation.intent.name === intentToTest.name)
        {
          if (interpretation.nluConfidence.score < test.confidence)
          {
            intentResult.problems.push({
              test: test.utterance,
              cause: `Confidence: [${interpretation.nluConfidence.score}] below threshold: [${test.confidence}]`
            });
            problemCount++;
          }

          if (test.slots !== undefined)
          {
            for (var s = 0; s < test.slots.length; s++)
            {
              var testSlot = test.slots[s];

              var slotResult = verifyTestSlot(interpretation, testSlot, test.utterance);

              if (!slotResult.success)
              {
                intentResult.problems.push({
                  test: test.utterance,
                  cause: slotResult.cause
                });
                problemCount++;
              }
            }
          }
        }
        else
        {
          intentResult.problems.push({
            test: test.utterance,
            cause: 'Intent mismatch: ' + interpretation.intent.name
          });
          problemCount++;
        }

        if (problemCount > 0)
        {
          intentResult.fail++;
          failures++;
        }
        else
        {
          intentResult.success++;
        }
      }

      results.push(intentResult);
    }

    if (failures > 0)
    {
      console.error('[ERROR] failed test results:\n' + JSON.stringify(results, null, 2));
      throw new Error(`Detected ${failures} failed test(s)`);
    }
    else
    {
      console.info('[INFO] successful test results:\n' + JSON.stringify(results, null, 2));
    }
  }
  catch (error)
  {
    console.error('[ERROR] tests failed: ' + error.message);
    throw error;
  }
}

/**
 * Given an interpretation for a matched intent, very slots match
 * these are always lowercase
 */
function verifyTestSlot(interpretation, testSlot, utterance)
{
  var slotNameLower = testSlot.name.toLowerCase();

  console.info(`[INFO] Verifying slot: ${testSlot.name} in utterance: ${utterance}\n${JSON.stringify(interpretation, null, 2)}`);

  var matchedSlot = interpretation.intent.slots[slotNameLower];

  if (matchedSlot === undefined || matchedSlot === null)
  {
    return {
      success: false,
      cause: `Did not fill expected slot: ${testSlot.name}`
    };
  }

  // Verify the slot value if passed
  if (testSlot.value !== undefined)
  {
    var testSlotExpected = testSlot.value.toLowerCase();

    var slotValueFound = undefined;

    console.info('[INFO] Matched slot: ' + JSON.stringify(matchedSlot, null, 2));

    if (matchedSlot.value.resolvedValues !== undefined &&
        matchedSlot.value.resolvedValues.length > 0)
    {
      slotValueFound = matchedSlot.value.resolvedValues[0];
    }

    if (slotValueFound === testSlotExpected)
    {
      return {
        success: true
      };
    }
    else
    {
      return {
        success: false,
        cause: `Expected slot: [${testSlot.name}] to equal: [${testSlot.value}] found: [${slotValueFound}] original value: [${matchedSlot.value.originalValue}] interpreted value: [${matchedSlot.value.interpretedValue}]`
      };
    }
  }
  else
  {
    // No value to check, success if slot is filled
    return {
      success: true
    };
  }
}

/**
 * Main setup function that parses command line inputs for the environment
 * and the bot to deploy
 */
async function main()
{
  var myArgs = process.argv.slice(2);

  if (myArgs.length < 1)
  {
    console.error('[ERROR] usage: node deploy_lex_bot.js <bot file> [--force]');
    process.exit(1);
  }

  try
  {
    var botConfig = JSON.parse(fs.readFileSync(myArgs[0], 'UTF-8'));

    upgradeBotConfig(botConfig);

    var force = false;

    if (myArgs.length == 2)
    {
      if (myArgs[1] === '--force')
      {
        console.info(`[INFO] forcing a deployment`);
        force = true;
      }
    }

    var envConfig =
    {
      stage: process.env.stage,
      service: process.env.service,
      region: process.env.region,
      accountNumber: process.env.accountNumber,
      conversationalLogsBucketArn: process.env.conversationalLogsBucketArn,
      connectInstanceArn: process.env.instanceArn,
      lexRoleArn: process.env.lexRoleArn,
      deploymentBucket: process.env.deploymentBucket
    };

    if (botConfig.fulfillmentFunction !== undefined)
    {
      envConfig.fulfillmentFunctionArn = `arn:aws:lambda:${envConfig.region}:${envConfig.accountNumber}:function:${envConfig.stage}-${envConfig.service}-${botConfig.fulfillmentFunction}`;
    }

    console.info(`[INFO] using configuration:\n${JSON.stringify(envConfig, null, 2)}`);

    lexmodelsv2 = new AWS.LexModelsV2({region: envConfig.region});
    lexruntimev2 = new AWS.LexRuntimeV2({region: envConfig.region});
    cloudWatchLogs = new AWS.CloudWatchLogs({region: envConfig.region});
    s3 = new AWS.S3({region: envConfig.region});

    var newHash = computeHash(botConfig, envConfig);

    // Check for changes to the bot since last deploy
    if (!await checkDeployRequired(botConfig, envConfig, newHash, force))
    {
      console.info(`[INFO] no deployment is required, exiting`);
      return;
    }

    // Deploy the bot
    await deployBot(botConfig, envConfig);

    // Save the hash to S3 for next time
    await saveHash(botConfig, envConfig, newHash);

    console.info('[INFO] successfully tested and deployed bot: ' + botConfig.status.fullBotName);
  }
  catch (error)
  {
    console.error('[ERROR] deploying bot failed', error);
    process.exit(1);
  }
}

function upgradeBotConfig(botConfig)
{
  // Inject empty slots if they are not provided
  if (botConfig.slots === undefined)
  {
    console.info('[INFO] default to empty slots array for bot: ' + botConfig.name);
    botConfig.slots = [];
  }

  if (botConfig.format === undefined)
  {
    console.info('[INFO] defaulting bot config format to 1 for bot: ' + botConfig.name);
    botConfig.format = '1';
  }
}

/**
 * Fetches a bot alias arn for a bot
 */
function createBotAliasArn(region, accountNumber, botId, botAliasId)
{
  try
  {
    var arn = `arn:aws:lex:${region}:${accountNumber}:bot-alias/${botId}/${botAliasId}`;

    console.info('[INFO] created lex bot arn: ' + arn);

    return arn;
  }
  catch (error)
  {
    console.error('[ERROR] failed to create bot alias', error);
    throw error;
  }
};

/**
 * Creates a resource policy allowing Connect to access the lex bot
 */
async function grantConnectAccess(accountNumber, connectInstanceArn, lexBotArn)
{
  try
  {
    var policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Service: 'connect.amazonaws.com'
          },
          Action: [
            'lex:RecognizeText',
            'lex:StartConversation',
          ],
          Resource: lexBotArn,
          Condition: {
            StringEquals: {
              'AWS:SourceAccount': accountNumber
            },
            ArnEquals:
            {
              'AWS:SourceArn': connectInstanceArn
            }
          }
        }
      ]
    };

    try
    {
      var describeRequest = {
        resourceArn: lexBotArn
      };

      var response = await lexmodelsv2.describeResourcePolicy(describeRequest).promise();

      var updateRequest = {
        policy: JSON.stringify(policy),
        resourceArn: lexBotArn,
        expectedRevisionId: response.revisionId
      };

      await lexmodelsv2.updateResourcePolicy(updateRequest).promise();
      console.info('[INFO] updated resource policy');
    }
    catch (error)
    {

      var createRequest = {
        policy: JSON.stringify(policy),
        resourceArn: lexBotArn
      };

      await lexmodelsv2.createResourcePolicy(createRequest).promise();
      console.info('[INFO] created resource policy');
    }
  }
  catch (error)
  {
    console.error('[ERROR] Failed to associate Lex bot with Connect instance', error);
    throw error;
  }
}

/**
 * Removes all bot versions except the most recent version
 */
 async function pruneBotVersions(botConfig)
 {
  try
  {
    console.info('[INFO] Fetching bot versions for botId: ' + botConfig.status.botId);

    //fetch bot versions ordered in ascending order

    var listBotVersionsRequest =
    {
      botId: botConfig.status.botId,
      maxResults: 100
    };

    var botVersions = [];

    var listBotVersionsResponse = await lexmodelsv2.listBotVersions(listBotVersionsRequest).promise();

    botVersions = botVersions.concat(listBotVersionsResponse.botVersionSummaries);

    while (listBotVersionsResponse.nextToken !== null)
    {
      listBotVersionsRequest.nextToken = listBotVersionsResponse.nextToken;
      listBotVersionsResponse = await lexmodelsv2.listBotVersions(listBotVersionsRequest).promise();
      botVersions = botVersions.concat(listBotVersionsResponse.botVersionSummaries);
    }

    //remove DRAFT version as it cannot be deleted
    botVersions = botVersions.filter(version => version.botVersion !== 'DRAFT');

    //sort by created date
    botVersions.sort(function (a, b)
    {
      return b.creationDateTime - a.creationDateTime;
    });

    console.info('[INFO] Fetched bot versions: ' + botVersions.length);

    // Remove 5 most recent version from array
    botVersions = botVersions.slice(5, botVersions.length);

    //delete the remaining bot versions

    console.info('[INFO] Deleting bot versions: ' + JSON.stringify(botVersions.map(v => v.botVersion)));

    for (const version of botVersions)
    {

      var deleteBotVersionRequest =
      {
        botId: botConfig.status.botId,
        botVersion: version.botVersion
      };

      var deleteBotVersionResponse = await lexmodelsv2.deleteBotVersion(deleteBotVersionRequest).promise();

      if (!deleteBotVersionResponse.err)
      {
        console.info('[INFO] Successfully deleted bot version: ' + version.botVersion);
      }
      else
      {
        console.error('[ERROR] Failed to deleted bot version: ' + version.botVersion + ' with error: ' + JSON.stringify(deleteBotVersionResponse.err));
      }

      //sleep to avoid API throttling
      await sleepFor(500);
    }
  }
  catch (error)
  {
    console.error('[ERROR] failed to prune bot versions: ' + error.message);
    throw error;
  }
}

/**
 * Checks object exists in S3
 */
async function checkExists(bucket, key)
{
  try
  {
    var headRequest = {
      Bucket: bucket,
      Key: key
    };

    await s3.headObject(headRequest).promise();
    return true;
  }
  catch (error)
  {
    return false;
  }
}

/**
 * Fetches object content from S3
 */
async function getObject(bucket, key)
{
  try
  {
    const getRequest = {
      Bucket: bucket,
      Key: key
    };

    var s3Object = await s3.getObject(getRequest).promise();
    return s3Object.Body.toString('utf-8');
  }
  catch (error)
  {
    console.error('[ERROR] failed to read object from  S3', error);
    throw error;
  }
}

/**
 * Fetches object content from S3
 */
async function putObject(bucket, key, content)
{
  try
  {
    var put = {
      Bucket: bucket,
      Key: key,
      Body: content
    };

    await s3.putObject(put).promise();
  }
  catch (error)
  {
    console.error('[ERROR] failed to save object to S3', error);
    throw error;
  }
}

/**
 * Computes a hash of the concatenated bot and env configs as JSON
 */
function computeHash(botConfig, envConfig)
{
  var raw = JSON.stringify(botConfig) + JSON.stringify(envConfig);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Sleeps for the requested time
 */
function sleepFor(millis)
{
  return new Promise((resolve) => setTimeout(resolve, millis));
}

/**
 * Perform retryable actions against Lex
 */
async function retryableLexV2Action(lexAction, description)
{
  var maxRetries = 10;
  var retry = 0;
  var lastFailure = undefined;

  while (retry < maxRetries)
  {
    try
    {
      return await lexAction();
    }
    catch (error)
    {
      lastFailure = error;
      await backoff(description, retry, error);
      retry++;
    }
  }

  console.error(`${description} failure detected, max retries exceeded`, lastFailure);
  throw new Error(`${description} failure detected, max retries exceeded`, lastFailure);
}

/**
 * Sleeps for a jittered retry time with exponential backoff
 * random sleep time determined between min sleep time (250ms)
 * and current clamped amx sleep time (16000ms)
 */
async function backoff(context, retry, error)
{
  var sleepTime = computeSleepTime(retry);
  console.info(`Backing off: ${context} at retry: ${retry} sleeping for: ${sleepTime} due to: ${error.message}`);
  await backoffSleep(sleepTime);
}

/**
 * Compute a jittered sleep time for a retry between
 * the min sleep time and computed exponential vackoff
 */
function computeSleepTime(retry)
{
  var baseTime = 250;
  var scaling = 2;
  var clampedRetry = Math.min(retry, 5);
  var maxWaitTime = baseTime * Math.pow(scaling, clampedRetry);
  var actualWaitTime = Math.floor(maxWaitTime * Math.random());
  return Math.max(baseTime, actualWaitTime);
}

/**
 * Sleep for requested time in millis
 */
function backoffSleep(time)
{
  return new Promise((resolve) => setTimeout(resolve, time));
}

// Call the main function
main();
