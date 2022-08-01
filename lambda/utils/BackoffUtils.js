
/**
 * Sleeps for a jittered retry time with exponential backoff
 * random sleep time determined between min sleep time (250ms)
 * and current clamped amx sleep time (16000ms)
 */
module.exports.backoff = async (context, retry, error) =>
{
  var sleepTime = computeSleepTime(retry);
  console.info(`Backing off: ${context} at retry: ${retry} sleeping for: ${sleepTime} due to: ${error.message}`);
  await backoffSleep(sleepTime);
};

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
