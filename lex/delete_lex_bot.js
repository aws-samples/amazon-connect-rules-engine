// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var AWS = require('aws-sdk');

var fs = require('fs');

var lexmodelsv2 = undefined; //new AWS.LexModelsV2();
var s3 = undefined;
var cloudWatchLogs = undefined;

/**
 * Called by the main function to delete a bot.
 * This function first checks to see if a bot exists and
 * deletes it if it exists.
 */
async function deleteBot(botConfig, envConfig)
{
  try
  {
    botConfig.status = {
      fullBotName: getBotName(botConfig, envConfig)
    };

    console.log(`[INFO] deleting bot: ${botConfig.status.fullBotName} - ${botConfig.localeId} (${botConfig.voice} - ${botConfig.engine})`);

    var bot = await getBot(botConfig, envConfig);

    var deleted = false;

    if (bot !== undefined)
    {
      bot = await deleteLexBot(bot, botConfig, envConfig);
      deleted = true;
    }

    await deleteHash(botConfig, envConfig);

    await deleteLogGroup(botConfig, envConfig);

    if (deleted)
    {
      console.info('[INFO] bot deleted successfully');
    }
    else
    {
      console.info('[INFO] bot did not exist');
    }
  }
  catch (error)
  {
    throw error;
  }
}

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
 * Deletes an existing hash from S3
 */
async function deleteHash(botConfig, envConfig, newHash)
{
  var hashKey = `lex/${envConfig.service}/${envConfig.stage}/${botConfig.name}.hash`;

  if (checkExists(envConfig.deploymentBucket, hashKey))
  {
    await deleteObject(envConfig.deploymentBucket, hashKey);
    console.info(`[INFO] deleted bot hash from: s3://${envConfig.deploymentBucket}/${hashKey}`);
  }
  else
  {
    console.info(`[INFO] skipping missing bot hash from S3`);
  }
}

/**
 * Deletes a log group if it exists
 */
async function deleteLogGroup(botConfig, envConfig)
{
  try
  {
    var logGroupName = `/aws/lex/${botConfig.status.fullBotName}`;

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

    if (logGroups.length !== 0)
    {
      console.info('[INFO] log group is exists, deleting: ' + logGroupName);

      var deleteRequest = {
        logGroupName: logGroupName
      };

      var deleteResponse = await cloudWatchLogs.deleteLogGroup(deleteRequest).promise();

      console.info('[INFO] deleted log group successfully: ' + logGroupName);
    }
    else
    {
      console.info('[INFO] log group does not exist, skipping delete: ' + logGroupName);
    }
  }
  catch (error)
  {
    console.error('[ERROR] failed to delete log group', error);
    throw error;
  }
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
}

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
    console.error('[ERROR] usage: node delete_lex_bot.js <bot file>');
    process.exit(1);
  }

  try
  {
    var botConfig = JSON.parse(fs.readFileSync(myArgs[0], 'UTF-8'));

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

    console.info(`[INFO] using configuration:\n${JSON.stringify(envConfig, null, 2)}`);

    lexmodelsv2 = new AWS.LexModelsV2({region: envConfig.region});
    s3 = new AWS.S3({region: envConfig.region});
    cloudWatchLogs = new AWS.CloudWatchLogs({region: envConfig.region});

    // Delete the bot
    await deleteBot(botConfig, envConfig);

    console.info('[INFO] successfully deleted bot: ' + botConfig.status.fullBotName);
  }
  catch (error)
  {
    console.error('[ERROR] deleting bot failed', error);
    process.exit(1);
  }
}

/**
 * Deletes a bot
 */
async function deleteLexBot(bot, botConfig, envConfig)
{
  try
  {
    var request =
    {
      botId: bot.botId
    };

    var deleteBotAction = async () =>
    {
      await lexmodelsv2.deleteBot(request).promise();
    };

    await retryableLexV2Action(deleteBotAction, 'Delete bot');
  }
  catch (error)
  {
    console.error('[ERROR] failed to delete bot', error);
    throw error;
  }
}

/**
 * Deletes an object from S3
 */
async function deleteObject(bucket, key)
{
  try
  {
    var params = {
      Bucket: bucket,
      Key: key
    };

    await s3.deleteObject(params).promise();
  }
  catch (error)
  {
    console.error('[ERROR] failed to delete object from S3', error);
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
