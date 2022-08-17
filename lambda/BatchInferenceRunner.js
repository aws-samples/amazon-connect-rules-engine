// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var requestUtils = require('./utils/RequestUtils');
var dynamoUtils = require('./utils/DynamoUtils');
var s3Utils = require('./utils/S3Utils');
var configUtils = require('./utils/ConfigUtils');
var inferenceUtils = require('./utils/InferenceUtils');

var moment = require('moment-timezone');

var axios = require('axios');
const https = require('https');

const { v4: uuidv4 } = require('uuid');

/**
 * Cache an Axios client for performance
 */
const myAxios = axios.create({
  timeout: 60000,
  httpsAgent: new https.Agent({ keepAlive: true }),
  maxRedirects: 0,
  maxContentLength: 50 * 1024 * 1024
});

var batchId = undefined;
var totalTestCount = 0;
var completeTestCount = 0;
var batchSize = +process.env.BATCH_SIZE;

/**
 * Batch runner that runs multiple concurrent inference tests
 * and is directly invoked by BatchInferenceStart Lambda function.
 * Manges results in DDB using the provided batch Id.
 * This gets passed an API key in the same spot as a web request but invoked
 * by BatchInferenceStart
 */
exports.handler = async(event, context) =>
{

  batchId = undefined;
  totalTestCount = 0;
  completeTestCount = 0;

  var results = [];

  try
  {
    requestUtils.logRequest(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var startTime = moment();

    // Validate the batch id
    if (event.batchId === undefined)
    {
      throw new Error('Request must contain a batchId');
    }

    batchId = event.batchId;
    var apiKey = event.requestContext.identity.apiKey;

    console.info(`Loading batch: ${batchId} for ${user.firstName} ${user.lastName} (${user.emailAddress})`);

    var batch = await dynamoUtils.getBatch(process.env.VERIFY_TABLE, batchId);
    var testIds = batch.testIds;

    console.info(`Found batch: ${batchId} with ${testIds.length} tests`);

    // Run all tests in parallel
    var success = true;

    // Update the global totalTestCount
    totalTestCount = testIds.length;

    var startIndex = 0;

    var testContexts = [];

    while (startIndex < testIds.length)
    {
      testPromises = [];

      var endIndex = Math.min(testIds.length, startIndex + batchSize);

      var batchTestIds = testIds.slice(startIndex, endIndex);

      console.info('Running batch test ids: ' + JSON.stringify(batchTestIds, null, 2));

      // Start executing each test and keep the promises aside
      for (var i = 0; i < batchTestIds.length; i++)
      {
        var testId = batchTestIds[i];
        testPromises.push(invokeTest(testId, user, batch, apiKey).then(async function (val) {
          await updateProgress();
          return val;
        }));
      }

      console.info('Test batch running, waiting for batch results');

      testContexts = testContexts.concat(await Promise.all(testPromises));

      startIndex += batchSize;
    }

    console.info('All tests are complete, processing results');

    var warning = false;

    // Save the results keyed against the test id
    testContexts.forEach(testContext =>
    {
      // Look at the test lines and check for failures and warnings
      testContext.testLines.forEach(testLine =>
      {
        if (testLine.warning === true)
        {
          testContext.warning = true;
          warning = true;
        }

        if (testLine.success === false)
        {
          testContext.success = false;
          success = false;
        }
      });

      // Check for errors in each test
      if (testContext.success === false)
      {
        success = false;
      }

      // Check for warnings in each test
      if (testContext.warning === true)
      {
        warning = true;
      }

      results.push(cleanContext(testContext));
    });

    results.sort(function (a, b) {
      return a.testName.localeCompare(b.testName);
    });

    var endTime = moment();
    var timeMillis = endTime.diff(startTime);

    console.info(`Completed batch: ${batchId} containing ${testIds.length} with success: ${success}`);

    var coverage = await computeCoverage(results);

    const now = moment().utc();
    const year = now.year();
    const month = now.month() + 1;
    const day = now.date();
    const timeStamp = now.format('YYYY-MM-DD-THH-mm-ssZ');

    const batchBucket = process.env.BATCH_BUCKET_NAME;
    const batchKey = `batches/${year}/${month}/${day}/${batchId}/batch.json.gz`;
    const coverageKey = `batches/${year}/${month}/${day}/${batchId}/coverage.json.gz`;

    await dynamoUtils.saveBatch(process.env.VERIFY_TABLE,
      batchId, 'COMPLETE', endTime, success, true, warning, results, coverage,
      batchBucket, batchKey, coverageKey);

    if (process.env.VERBOSE_LOGGING === 'true')
    {
      var finalResult = {
        batchId: batchId,
        timeMillis: timeMillis,
        testCount: testIds.length,
        success: success,
        testResults: results
      };

      console.info('Made success response: ' + JSON.stringify(finalResult, null, 2));
    }
  }
  catch (error)
  {
    console.error('Failed to run batch inference', error);

    if (batchId !== undefined)
    {
      await dynamoUtils.saveBatch(process.env.VERIFY_TABLE,
        batchId, 'ERROR', moment(), false, true, true, results, {},
        batchBucket, batchKey, coverageKey,
        error);
    }
    else
    {
      console.error('Could not save batch with no batch id');
    }

    throw error;
  }
}

/**
 * Invoked as each test completes
 */
async function updateProgress()
{
  completeTestCount++;
  console.info('Completed: ' + completeTestCount + ' tests of ' + totalTestCount + ' tests');

  try
  {
    await dynamoUtils.updateBatchProgress(process.env.VERIFY_TABLE, batchId, completeTestCount);
  }
  catch(error)
  {
    console.error('Failed to record progress');
  }
}

/**
 * Run the test until we either error, reach queue or get terminated
 * waiting this function will return the populated testContext
 */
async function invokeTest(testId, user, batch, apiKey)
{
  try
  {
    var test = await dynamoUtils.getTest(process.env.TESTS_TABLE, testId);

    // Create a context object to track the test execution
    var context = {
      testName: test.name,
      testId: test.testId,
      test: test,
      success: true,
      error: undefined,
      user: user,
      batch: batch,
      batchId: batch.batchId,
      testLine: -1,
      testLines: [],
      messageStack: [], // A stack of messages to be matched
      attributeLines: [], // An array of attribute test lines
      stateLines: [], // An array of state test lines
      nextInput: undefined,
      endPoint: test.endPoint,
      customerPhoneNumber: test.customerPhoneNumber,
      testDateTime: test.testDateTime,
      contactId: undefined,
      apiKey: apiKey,
      startTime: moment(),
      result: undefined,
      interactions: []
    };

    // Parse out the test lines
    parseTestLines(context, test);

    // Check parse result and fail
    if (context.success === false)
    {
      console.error('Test failure detected before inferencing');
      failRemainingTestLines(context);
      context.endTime = moment();
      return context;
    }

    // Compute the next input
    computeNextInput(context);

    // Compute the first queue
    computeFirstQueue(context);

    // Compute the first terminate
    computeFirstTerminate(context);

    // Compute the first external number
    computeFirstExternalNumber(context);

    // Compute the attribute lines
    computeAttributeLines(context);

    // Compute the state lines
    computeStateLines(context);

    // Check processing result and run if good
    if (context.success === false)
    {
      console.error('Test failure detected before inferencing');
      failRemainingTestLines(context);
      context.endTime = moment();
      return context;
    }

    // Start inferencing
    await startInferencing(context);

    var done = false;

    // Wait until we get an error, a hang up or reach a queue
    while (context.success === true && !done)
    {
      // Try and match incoming messages to the message stack
      if (context.lastResponse.message !== undefined)
      {
        matchMessages(context);
      }

      // Handle reaching a queue
      if (context.lastResponse.queue !== undefined)
      {
        if (context.firstQueue !== undefined)
        {
          if (context.firstQueue.payload === context.lastResponse.queue)
          {
            context.firstQueue.success = true;
            addInfo(context.firstQueue, `Matched queue: ${context.firstQueue.payload}`);
          }
          else
          {
            context.firstQueue.success = false;
            addWarning(context.firstQueue, `Expected: ${context.firstQueue.payload}\nActual: ${context.lastResponse.queue}`);
          }
        }
        else
        {
          // Add a root warning about reaching a queue with no check
          addWarning(context, `Reached queue: ${context.lastResponse.queue} with no queue check`);
        }

        done = true;
      }
      else if (context.lastResponse.terminate === true)
      {
        if (context.firstTerminate !== undefined)
        {
          context.firstTerminate.success = true;
        }
        else
        {
          // Add a root warning about reaching a terminate with no check
          addWarning(context, `Reached terminate with no terminate check`);
        }

        done = true;
      }
      else if (context.lastResponse.externalNumber !== undefined)
      {
        if (context.firstExternalNumber !== undefined)
        {
          var regex = new RegExp(context.firstExternalNumber.payload);

          if (regex.test(context.lastResponse.externalNumber))
          {
            context.firstExternalNumber.success = true;
            addInfo(context.firstExternalNumber, `Matched external number: ${context.lastResponse.externalNumber}`);
          }
          else
          {
            context.firstExternalNumber.success = false;
            addWarning(context.firstExternalNumber, `Expected: ${context.firstExternalNumber.payload}\nActual: ${context.lastResponse.externalNumber}`);
          }
        }
        else
        {
          // Add a root warning about reaching a queue with no check
          addWarning(context, `Reached external number: ${context.lastResponse.externalNumber} with no external number check`);
        }

        done = true;
      }
      // Check for input
      else if (context.lastResponse.inputRequired === true)
      {
        if (context.nextInput === undefined)
        {
          context.success = false;
          addWarning(context, 'Encountered input with no more input lines');
        }
        else
        {
          context.nextInput.success = true;
          addInfo(context.nextInput, `Prompt message: ${context.lastResponse.message}`);
          await sendInput(context, context.nextInput);
          computeNextInput(context);
        }
      }
      else
      {
        await nextRule(context);
      }
    }

    var lastState = context.interactions[context.interactions.length - 1].response.state;

    /**
     * Validate attributes
     */
    validateAttributes(context, lastState);

    /**
     * Validate states
     */
    validateStates(context, lastState);

    /**
     * Fail remaining test lines
     */
    failRemainingTestLines(context);
  }
  catch (error)
  {
    console.error('Failed to inference', error);
    failRemainingTestLines(context);
    context.success = false;
    addWarning(context, `Failed to inference: ${error.message}`);
  }

  context.endTime = moment();
  return context;
}

/**
 * Check to see if there are attributes test lines to validate at the end of the interaction
 */
function validateAttributes(context, lastState)
{
  for (var i = 0; i < context.attributeLines.length; i++)
  {
    var attributeLine = context.attributeLines[i];
    console.info('Validating attribute line: ' + JSON.stringify(attributeLine, null, 2));

    var key = attributeLine.payload.key;
    var value = attributeLine.payload.value;

    if (key === undefined || key === '')
    {
      addWarning(attributeLine, 'Attribute with invalid key');
      attributeLine.success = false;
    }
    else if (lastState.ContactAttributes === undefined)
    {
      addWarning(attributeLine, 'No ContactAttributes found in last state');
      attributeLine.success = false;
    }
    else
    {
      var rawValue = lastState.ContactAttributes[key];

      try
      {
        // If both value and rawValue are empty this is a match
        if (inferenceUtils.isEmptyString(value) && inferenceUtils.isEmptyString(rawValue))
        {
          attributeLine.success = true;
          addInfo(attributeLine, `Matched empty attribute: ${key}`);
        }
        else if (inferenceUtils.isEmptyString(value) && !inferenceUtils.isEmptyString(rawValue))
        {
          attributeLine.success = false;
          addWarning(attributeLine, `Expected: Empty\nActual: ${rawValue}`);
        }
        else
        {
          var regex = new RegExp(value);
          var regexCaseInsensitive = new RegExp(value, 'i');

          // If we match exactly then succeed
          if (regex.test(rawValue))
          {
            attributeLine.success = true;
            addInfo(attributeLine, `Matched attribute: ${key} = ${value}\nActual value: ${rawValue}`);
          }
          // If we match case insenstively then succeed with a warning
          else if (regexCaseInsensitive.test(rawValue))
          {
            attributeLine.success = true;
            addInfo(attributeLine, `Matched attribute: ${key} = ${value}\nActual value: ${rawValue}`);
            addWarning(attributeLine, 'Case insensitive match found');
          }
          else
          {
            attributeLine.success = false;
            addWarning(attributeLine, `Expected: ${value}\nActual: ${rawValue}`);
          }
        }
      }
      catch (error)
      {
        console.error('Failed to verify attribute', error);
        attributeLine.success = false;
        addWarning(attributeLine, 'Attribute verification failed: ' + error.message);
      }
    }
  }
}

/**
 * Check to see if there are state test lines to validate at the end of the interaction
 */
function validateStates(context, lastState)
{
  for (var i = 0; i < context.stateLines.length; i++)
  {
    var stateLine = context.stateLines[i];
    console.info('Validating state line: ' + JSON.stringify(stateLine, null, 2));

    var key = stateLine.payload.key;
    var value = stateLine.payload.value;

    if (key === undefined || key === '')
    {
      addWarning(stateLine, 'State with invalid key');
      stateLine.success = false;
    }
    else
    {
      var rawValue = inferenceUtils.getStateValueForPath(key, lastState);

      try
      {
        // If both value and rawValue are empty this is a match
        if (inferenceUtils.isEmptyString(value) && inferenceUtils.isEmptyString(rawValue))
        {
          stateLine.success = true;
          addInfo(stateLine, `Matched empty state: ${key}`);
        }
        else if (inferenceUtils.isEmptyString(value) && !inferenceUtils.isEmptyString(rawValue))
        {
          stateLine.success = false;
          addWarning(stateLine, `Expected: Empty\nActual: ${rawValue}`);
        }
        else
        {
          var regex = new RegExp(value);
          var regexCaseInsensitive = new RegExp(value, 'i');

          // If we match exactly then succeed
          if (regex.test(rawValue))
          {
            stateLine.success = true;
            addInfo(stateLine, `Matched state: ${key} = ${value}\nActual value: ${rawValue}`);
          }
          // If we match case insenstively then succeed with a warning
          else if (regexCaseInsensitive.test(rawValue))
          {
            stateLine.success = true;
            addInfo(stateLine, `Matched state: ${key} = ${value}\nActual value: ${rawValue}`);
            addWarning(stateLine, 'Case insensitive match found');
          }
          else
          {
            stateLine.success = false;
            addWarning(stateLine, `Expected: ${value}\nActual: ${rawValue}`);
          }
        }
      }
      catch (error)
      {
        console.error('Failed to verify state', error);
        stateLine.success = false;
        addWarning(stateLine, 'State verification failed: ' + error.message);
      }
    }
  }
}

/**
 * Computes attrbute lines to verify after completion
 */
function computeAttributeLines(context)
{
  for (var i = 0; i < context.testLines.length; i++)
  {
    if (context.testLines[i].type === 'attribute')
    {
      context.attributeLines.push(context.testLines[i]);
    }
  }

  console.info(`Found ${context.attributeLines.length} attribute lines`);
}

/**
 * Computes attrbute lines to verify after completion
 */
function computeStateLines(context)
{
  for (var i = 0; i < context.testLines.length; i++)
  {
    if (context.testLines[i].type === 'state')
    {
      context.stateLines.push(context.testLines[i]);
    }
  }

  console.info(`Found ${context.stateLines.length} state lines`);
}

/**
 * Computes the next input capturing the messages up until then on messageStack
 */
function computeNextInput(context)
{
  context.testLine++;

  // Clear the next input
  context.nextInput = undefined;

  // Fail any remaining messages on the message stack and clear the stack
  failRemainingMessages(context);

  // Keep moving forward until we get an input or run out of test lines
  do
  {
    var candidate = context.testLines[context.testLine];

    // Found an input, break
    if (candidate.type === 'input')
    {
      context.nextInput = candidate;
      break;
    }
    // Track messages we can validate
    else if (candidate.type === 'message')
    {
      candidate.done = false;
      context.messageStack.push(candidate);
    }

    context.testLine++;
  }
  while (context.nextInput === undefined && context.testLine < context.testLines.length);
}

/**
 * Look at all input lines and find the first queue if there is one
 */
function computeFirstQueue(context)
{
  for (var i = 0; i < context.testLines.length; i++)
  {
    if (context.testLines[i].type === 'queue')
    {
      context.firstQueue = context.testLines[i];
      console.info(`Found first queue at: ${i}`);
      break;
    }
  }
}

/**
 * Look at all input lines and find the first terminate if there is one
 */
function computeFirstTerminate(context)
{
  for (var i = 0; i < context.testLines.length; i++)
  {
    if (context.testLines[i].type === 'terminate')
    {
      context.firstTerminate = context.testLines[i];
      console.info(`Found first terminate at: ${i}`);
      break;
    }
  }
}

/**
 * Look at all input lines and find the first external number if there is one
 */
function computeFirstExternalNumber(context)
{
  for (var i = 0; i < context.testLines.length; i++)
  {
    if (context.testLines[i].type === 'externalNumber')
    {
      context.firstExternalNumber = context.testLines[i];
      console.info(`Found first external number at: ${i}`);
      break;
    }
  }
}

/**
 * Process the next rule
 */
async function startInferencing(context)
{
  try
  {
    var request = {
      eventType: 'NEW_INTERACTION',
      customerPhoneNumber: context.test.customerPhoneNumber,
      endPoint: context.test.endPoint,
      interactionDateTime: context.test.testDateTime,
      contactAttributes: context.test.contactAttributes
    };

    // Make the request which will process the response
    await sendRequest(context, request);

    // Record the contact id if we started OK
    if (context.success)
    {
      context.contactId = context.lastResponse.contactId;
      console.info(`Test: ${context.testId} Found contact id: ${context.contactId}`);
    }
  }
  catch (error)
  {
    console.error('Failed to start inferencing', error);
    context.success = false;
    addWarning(context, `Failed to start inferencing: ${error.message}`);
  }
}

/**
 * Process the next rule
 */
async function nextRule(context)
{
  try
  {
    var request = {
      eventType: 'NEXT_RULE',
      contactId: context.contactId
    };

    // Make the request which will process the response
    await sendRequest(context, request);
  }
  catch (error)
  {
    console.error('Failed to request the next rule', error);
    context.success = false;
    addWarning(context, `Failed to request next rule: ${error.message}`);
  }
}

/**
 * Sends input
 */
async function sendInput(context, testLine)
{
  try
  {
    var request = {
      eventType: 'INPUT',
      contactId: context.contactId,
      input: testLine.payload
    };

    // Provide the input
    await sendRequest(context, request);
  }
  catch (error)
  {
    console.error('Failed to send input', error);
    context.success = false;
    addWarning(context, `Failed to send input: ${error.message}`);
  }
}

/**
 * Sends a request, storing the request and response
 * and marking context.success = false on error
 */
async function sendRequest(context, message)
{
  try
  {
    var startTime = moment();

    var options = {
      headers: {
        'x-api-key': context.apiKey,
        'origin': JSON.parse(process.env.VALID_ORIGINS)[0]
      }
    };

    addCommonRequestParams(message);

    var url = process.env.INFERENCE_URL;

    // Store the request
    context.lastRequest = message;

    var response = await myAxios.post(url, message, options);

    // Store and log the response
    context.lastResponse = response.data;

    var endTime = moment();

    var timeMillis = endTime.diff(startTime);

    context.interactions.push({
      request: context.lastRequest,
      response: context.lastResponse,
      timeMillis: timeMillis
    });
  }
  catch (error)
  {
    console.error('Failed to inference', error);
    throw error;
  }
}

function logRequest(message)
{
  console.info(JSON.stringify(message, null, 2));
}

function logResponse(message)
{
  var copy = JSON.parse(JSON.stringify(message));
  copy.state = undefined;
  copy.audio = undefined;
  console.info(JSON.stringify(copy, null, 2));
}

/**
 * Add common request parameters lie disabling voice rendering
 */
function addCommonRequestParams(message)
{
  message.generateVoice = false;
}

/**
 * Parses the line lines
 */
function parseTestLines(context, test)
{
  try
  {
    var trimmed = test.payload.trim();
    var lines = trimmed.split('\n');

    for (var i = 0; i < lines.length; i++)
    {
      var line = lines[i].trim();

      if (line !== '' && !line.startsWith('#'))
      {
        var testLine = parseTestEntry(line);

        if (testLine.type === 'message' && testLine.payload === '')
        {
          throw new Error('Invalid empty message payload detected');
        }
        context.testLines.push(testLine);
      }
    }
  }
  catch (error)
  {
    context.success = false;
    addWarning(context, `Failed to parse test script: ${error.message}`);
  }
}

/**
 * Parses a test line which must be valid
 * JSON after the first ':' or no : provided.
 * For example:
 *  message: "This is my message"
 *  input: "5"
 *  queue: "Billing"
 *  attribute: { "key": "agt_accountNumber", "value": "10000" }
 *  terminate
 */
function parseTestEntry(testLine)
{
  var i = testLine.indexOf(':');

  if (i < 5)
  {
    console.error(`Found invalid test line: ${testLine} cause: no apropriate colon found`);
    throw new Error(`Found invalid test line: ${testLine} cause: no appropriate colon found`);
  }
  else
  {
    var type = testLine.slice(0,i).trim();
    var payload = testLine.slice(i+1).trim();

    try
    {
      var parsedPayload = JSON.parse(payload);

      return {
        type: type,
        payload: parsedPayload
      };
    }
    catch (error)
    {
      console.error(`Found invalid test line: ${testLine} cause: ${error.message}`, error);
      throw new Error(`Found invalid test line: ${testLine} cause: ${error.message}`, error);
    }
  }
}

/**
 * Cleans the context for persisting
 */
function cleanContext(context)
{
  var clean = {
    testId: context.testId,
    testName: context.test.name,
    testReference: context.test.testReference,
    contactId: context.contactId,
    customerPhoneNumber: context.customerPhoneNumber,
    endPoint: context.endPoint,
    testDateTime: context.testDateTime,
    success: context.success,
    warning: context.warning,
    warnings: context.warnings,
    testLines: context.testLines,
    startTime: context.startTime.format('YYYY-MM-DDTHH:mm:ss.SSSZ'),
    endTime: null,
    interactions: context.interactions
  };

  clean.lastState = {};

  // Guard against failed starts
  if (context.interactions.length > 0)
  {
    clean.lastState = context.interactions[context.interactions.length - 1].response.state;
  }

  clean.interactions.forEach(interaction => {
    delete interaction.response.state;
  });

  if (context.endTime !== undefined)
  {
    clean.endTime = context.endTime.format('YYYY-MM-DDTHH:mm:ss.SSSZ');
  }

  return clean;
}

function getWarningCount(context)
{
  var count = 0;

  context.testLines.forEach(testLine =>
  {
    if (testLine.warnings !== undefined)
    {
      count += testLine.warnings.length;
    }
  });

  return count;
}

function getErrorCount(context)
{
  var count = 0;

  context.testLines.forEach(testLine =>
  {
    if (testLine.success === false)
    {
      count++;
    }
  });

  return count;
}

/**
 * When we receive a message, look at the message stack and try
 * and tick any off we can, looking case insenstively as well and
 * adding warnings for any messages we only match case insensitively
 * or out of order.
 */
function matchMessages(context)
{
  // TODO perhaps skip integration, sms and metric messeages?

  // Check each message in the message stack
  for (var i = 0; i < context.messageStack.length; i++)
  {
    var message = context.messageStack[i];
    var laterMatch = isLaterMatch(context.messageStack, i);

    if (!message.success && !message.done)
    {
      try
      {
        var regex = new RegExp(message.payload);
        var regexCaseInsensitive = new RegExp(message.payload, 'i');

        // If we match exactly then succeed
        if (regex.test(context.lastResponse.message))
        {
          message.success = true;
          addInfo(message, `Matched message: ${context.lastResponse.message}`);

          if (laterMatch)
          {
            addWarning(message, 'Matched out of order');
          }

          break;
        }
        // If we match case insenstively then succeed with a warning
        else if (regexCaseInsensitive.test(context.lastResponse.message))
        {
          message.success = true;
          addInfo(message, `Matched message: ${context.lastResponse.message}`);
          addWarning(message, 'Case insensitive match found');

          if (laterMatch)
          {
            addWarning(message, 'Matched out of order');
          }

          break;
        }
      }
      catch (regexerror)
      {
        message.success = false;
        message.done = true;
        addWarning(message, 'Invalid regular expression');
      }
    }
    else
    {
      earlierMatch = true;
    }
  }
}

/**
 * Checks to see if a later message matched
 */
function isLaterMatch(messageStack, currentIndex)
{
  var laterMatch = false;

  for (var i = currentIndex + 1; i < messageStack.length; i++)
  {
    if (messageStack[i].success)
    {
      laterMatch = true;
      break;
    }
  }

  return laterMatch;
}

/**
 * Adds a warning to a message
 */
function addWarning(target, warning)
{
  target.warning = true;

  if (target.warnings === undefined)
  {
    target.warnings = [];
  }

  target.warnings.push(warning);
}

/**
 * Adds an info message
 */
function addInfo(target, info)
{
  if (target.info === undefined)
  {
    target.info = [];
  }

  target.info.push(info);
}

/**
 * Fails all messages in the message stack that haven't been matched yet
 */
function failRemainingMessages(context)
{
  for (var i = 0; i < context.messageStack.length; i++)
  {
    var messageLine = context.messageStack[i];

    if (messageLine.success !== true)
    {
      messageLine.success = false;
      addWarning(messageLine, 'Failed to match message');
    }
  }

  context.messageStack = [];
}

/**
 * The interaction is over so fail any test lines
 * that have not been executed, these could be placed after a queue
 * or terminate test line for example
 * TODO handle attribute tests
 */
function failRemainingTestLines(context)
{
  for (var i = 0; i < context.testLines.length; i++)
  {
    var testLine = context.testLines[i];

    if (testLine.success === undefined)
    {
      testLine.success = false;
      addWarning(testLine, 'Test line not executed');
    }
  }
}

/**
 * Compute ruleset and rule coverage metrics
 */
async function computeCoverage(batchResults)
{
  try
  {
    await inferenceUtils.cacheRuleSets(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    var ruleSets = await inferenceUtils.getRuleSets();

    var coverage = {
      covered: 0,
      uncovered: 100,
      ruleSets: []
    };

    ruleSets.forEach(ruleSet =>
    {
      var ruleSetCoverage =
      {
        name: ruleSet.name,
        id: ruleSet.ruleSetId,
        covered: 0,
        uncovered: 100,
        count: 0,
        rules: []
      };

      ruleSet.rules.forEach(rule => {
        var ruleCoverage = {
          name: rule.name,
          id: rule.ruleId,
          count: 0
        };
        ruleSetCoverage.rules.push(ruleCoverage);
      });

      coverage.ruleSets.push(ruleSetCoverage);
    });

    batchResults.forEach(testResult => {
      testResult.interactions.forEach(interaction => {
        var ruleSetCoverage = getRuleSetCoverage(interaction.response.ruleSet, coverage);
        ruleSetCoverage.count++;
        var ruleCoverage = getRuleCoverage(interaction.response.rule, ruleSetCoverage);
        ruleCoverage.count++;
      });
    });

    // Now compute coverage which is the total number of rules activated divided by the total rules
    var totalCoverage = 0;
    var totalRules = 0;
    var totalActivatedRules = 0;

    coverage.ruleSets.forEach(ruleSet =>
    {
      var rules = 0;
      var activatedRules = 0;

      ruleSet.rules.forEach(rule => {
        rules++;
        if (rule.count > 0)
        {
          activatedRules++;
        }
      });

      if (rules > 0)
      {
        ruleSet.covered = Math.floor(activatedRules / rules * 100);
        ruleSet.uncovered = 100 - ruleSet.covered;
      }

      totalRules += rules;
      totalActivatedRules += activatedRules;
    });

    if (totalRules > 0)
    {
      coverage.covered = Math.floor(totalActivatedRules / totalRules * 100);
      coverage.uncovered = 100 - coverage.covered;
    }

    return coverage;
  }
  catch (error)
  {
    console.error('Failed to compute coverge', error);
    throw error;
  }
}

function getRuleSetCoverage(ruleSetName, coverage)
{
  var ruleSetCoverage = coverage.ruleSets.find(rs => rs.name === ruleSetName);

  if (ruleSetCoverage === undefined)
  {
    throw new Error('Failed to find rule set in coverage for name: ' + ruleSetName);
  }

  return ruleSetCoverage;
}

function getRuleCoverage(ruleName, ruleSetCoverage)
{
  var ruleCoverage = ruleSetCoverage.rules.find(r => r.name === ruleName);

  if (ruleCoverage === undefined)
  {
    throw new Error('Failed to find rule in coverage for name: ' + ruleName);
  }

  return ruleCoverage;
}
