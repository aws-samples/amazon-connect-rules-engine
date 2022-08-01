
var keepWarmUtils = require('./utils/KeepWarmUtils');
var configUtils = require('./utils/ConfigUtils');
var lambdaUtils = require('./utils/LambdaUtils');

/**
 * Invokes Lambda functions in parallel to keep them warm,
 * tracking and logging the results
 */
exports.handler = async(event, context) =>
{
  try
  {
    await configUtils.checkLastChange(process.env.CONFIG_TABLE);

    var configItems = await configUtils.getConfigItems(process.env.CONFIG_TABLE);

    var response = {
      keepWarm: []
    };

    var lambdaFunctions = configItems.LambdaFunctions;

    var stage = process.env.STAGE;
    var service = process.env.SERVICE;

    if (configItems.KeepWarm !== undefined)
    {
      for (var i = 0; i < configItems.KeepWarm.length; i++)
      {
        var configItem = configItems.KeepWarm[i];

        var functionItem = undefined;

        // If we don't have a function Arn, determine the arn for this function
        // using the expansion of stage and service
        if (configItem.Arn === undefined)
        {
          var functionName = `${stage}-${service}-${configItem.Name}`;

          var functionConfig = lambdaFunctions.find(lambdaFunction => lambdaFunction.Name === functionName);

          if (functionConfig !== undefined)
          {
            console.info(`Found function config: ${JSON.stringify(functionConfig, null, 2)}`);
            functionItem = {
              name: functionConfig.Name,
              arn: functionConfig.Arn,
              count: configItem.Count
            };
          }
          else
          {
            console.error('Failed to locate function config: ' + functionName);
          }
        }
        else
        {
          functionItem = {
            name: configItem.Name,
            arn: configItem.Arn,
            count: configItem.Count
          };
        }

        if (functionItem !== undefined)
        {
          var results = await makeFunctionKeepWarmRequests(functionItem);
          response.keepWarm.push(results);
        }
        else
        {
          response.keepWarm.success = false;
          response.keepWarm.name = functionName;
          response.keepWarm.errors = [ 'Skipping invalid keep warm request for function: ' + functionName ];
          console.error(response.keepWarm.errors[0])
        }
      }
    }
    else
    {
      response.keepWarm.success = false;
      response.keepWarm.errors = [ 'No keep warm config found, skipping keep warm process' ];
      console.info(response.keepWarm.errors[0]);
    }

    console.info(JSON.stringify(response, null, 2));

    return response;
  }
  catch (error)
  {
    console.error('Failed to make keep warm request', error);
    throw error;
  }
}

/**
 * Makes a keep warm request for count of the provided Lambda function
 */
async function makeFunctionKeepWarmRequests(functionItem)
{
  var results = [];

  try
  {
    var functionPromises = [];

    var request = keepWarmUtils.createKeepWarmRequest(
      functionItem.name,
      functionItem.arn
    );

    for (var i = 0; i < functionItem.count; i++)
    {
      functionPromises.push(lambdaUtils.invokeSync(functionItem.arn, request).then(function (val) {
        return val;
      }));
    }

    var responses = await Promise.allSettled(functionPromises);

    var failedCount = 0;
    var successCount = 0;
    var coldCount = 0;
    var warmCount = 0;
    var duplicateIds = new Set();
    var minSeconds = undefined;
    var maxSeconds = undefined;
    var totalSeconds = 0;

    var errors = [];

    // Process the responses and aggregate summary data
    responses.forEach(warmResponse =>
    {
      if (warmResponse.status === 'rejected')
      {
        failedCount++;
        errors.push('Function call failed');
      }
      else
      {
        var valueResponse = JSON.parse(warmResponse.value);

        // Make sure we got a valid keep warm response
        if (!keepWarmUtils.isKeepWarmResponse(valueResponse))
        {
          failedCount++;
          errors.push('Function did not return a keep warm response');
        }
        else
        {
          successCount++;

          duplicateIds.add(valueResponse.keepWarm.id);

          if (valueResponse.keepWarm.coldStart === true)
          {
            coldCount++;
          }
          else
          {
            warmCount++;

            totalSeconds += valueResponse.keepWarm.runningTime;

            if (minSeconds === undefined)
            {
              minSeconds = valueResponse.keepWarm.runningTime;
            }

            minSeconds = Math.min(minSeconds, valueResponse.keepWarm.runningTime);

            if (maxSeconds === undefined)
            {
              maxSeconds = valueResponse.keepWarm.runningTime;
            }

            maxSeconds = Math.max(maxSeconds, valueResponse.keepWarm.runningTime);
          }
        }
      }
    });

    var meanSeconds = undefined;

    var duplicates = 0;

    if (warmCount > 0)
    {
      meanSeconds = Math.floor(totalSeconds / warmCount);
      duplicates = successCount - duplicateIds.size;
    }

    var coldPercent = Math.floor(coldCount / functionItem.count * 100);

    return {
      success: true,
      name: functionItem.name,
      warmCount: warmCount,
      coldCount: coldCount,
      coldPercent: coldPercent,
      duplicates: duplicates,
      successCount: successCount,
      failedCount: failedCount,
      totalCount: functionItem.count,
      minSeconds: minSeconds === undefined ? 0 : minSeconds,
      maxSeconds: maxSeconds === undefined ? 0 : maxSeconds,
      meanSeconds: meanSeconds,
      arn: functionItem.arn,
      errors: errors
    };
  }
  catch (error)
  {

    var response = {
      success: false,
      name: functionItem.name,
      functionArn: functionItem.arn,
      errors: [ error.message ]
    };

    console.error('Failed to process keep warm request for function: ' + JSON.stringify(response, null, 2), error);

    return response;
  }
}
