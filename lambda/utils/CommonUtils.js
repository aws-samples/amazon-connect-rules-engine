// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var moment = require('moment');

/**
 * Checks to see if value is a number
 */
module.exports.isNumber = (value) =>
{
  return !isNaN(parseFloat(value)) && isFinite(value);
};

/**
 * Sleep for time millis
 */
module.exports.sleep = (time) =>
{
  return new Promise((resolve) => setTimeout(resolve, time));
};

/**
 * Checks to see if this value undefined, null or the empty string
 */
module.exports.isEmptyString = (value) =>
{
  if (value === undefined ||
    value === null ||
    value === '')
  {
    return true;
  }

  return false;
};

/**
 * Returns true if the value is null or undefined or equal to the string
 * 'null' or 'undefined'
 */
module.exports.isNullOrUndefined = (value) =>
{
  if (value === undefined ||
      value === null ||
      value === 'null' ||
      value === 'undefined')
  {
    return true;
  }
  else
  {
    return false;
  }
};

/**
 * Get a now timestamp to the millisecond
 */
module.exports.nowUTCMillis = () =>
{
  return moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ');
};

/**
 * Clones an object
 */
module.exports.clone = (object) =>
{
  return JSON.parse(JSON.stringify(object));
};

/**
 * Safely merges an array of prompts, handling one or more being SSML
 */
module.exports.safelyMergePrompts = (promptsArray) =>
{
  var hasSSML = false;

  promptsArray.forEach(prompt =>
  {
    if (module.exports.isSSML(prompt))
    {
      hasSSML = true;
    }
  });

  var outputPrompt = '';

  if (hasSSML)
  {
    outputPrompt += '<speak>';
  }

  promptsArray.forEach(prompt =>
  {
    outputPrompt += `\n${module.exports.stripSSMLWrapper(prompt)}`;
  });

  if (hasSSML)
  {
    outputPrompt += '\n</speak>';
  }

  outputPrompt = outputPrompt.trim();

  return outputPrompt;
}


/**
 * Checks to see if this is an SSML tag
 */
module.exports.isSSML = (prompt) =>
{
  var trimmed = prompt.trim();
  return trimmed === '<speak/>' || (trimmed.startsWith('<speak>') && trimmed.endsWith('</speak>'));
}

/**
 * Strips wrapper speak tags
 */
module.exports.stripSSMLWrapper = (prompt) =>
{
  if (module.exports.isSSML(prompt))
  {
    return prompt.replace('<speak>', '').replace('</speak>', '').trim();
  }
  else
  {
    return prompt;
  }
}
