// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var moment = require('moment-timezone');
var Handlebars = require('handlebars');
var crypto = require('crypto');

var sprintf = require('sprintf-js').sprintf;

// Changes made to add LRU cache for complied handlebar templates. Story CONNECT-433
 var LRU = require('lru-cache');

// LRU cache for complied handlebar templates
var templatecacheOptions = { max: 10000, ttl: 1000 * 60 * 300 };
var templatecache = new LRU(templatecacheOptions);

/**
 * Provides the ability to compare for equality against
 * another value
 */
Handlebars.registerHelper('ifeq', function (a, b, options)
{
  if (a == b)
  {
    return options.fn(this);
  }

  return options.inverse(this);
});

Handlebars.registerHelper('notempty', function (a, options)
{
  if (!Handlebars.Utils.isEmpty(a))
  {
    return options.fn(this);
  }
  return options.inverse(this);
});

Handlebars.registerHelper('empty', function (a, options)
{
  if (Handlebars.Utils.isEmpty(a))
  {
    return options.fn(this);
  }
  return options.inverse(this);
});

Handlebars.registerHelper('switch', function(value, options)
{
  this.switch_value = value;
  this.switch_break = false;
  return options.fn(this);
});

Handlebars.registerHelper('case', function(value, options)
{
  if (value == this.switch_value)
  {
    this.switch_break = true;
    return options.fn(this);
  }
});

/**
 * Serialises an object to JSON
 */
Handlebars.registerHelper('json', function(context) {
  return JSON.stringify(context);
});

/**
 * Adds one to a passed value useful for zero based #each @index referencing
 */
Handlebars.registerHelper('paddedRandom', function(min, max, length, options)
{
  var value = crypto.randomInt(min, max);
  return sprintf('%0' + length + 'd', value);
});

/**
 * Adds one to a passed value useful for zero based #each @index referencing
 */
Handlebars.registerHelper('inc', function(value, options)
{
  return parseInt(value) + 1;
});

/**
 * Formats a date of birth for human reading
 */
function formatDOB(dob)
{
  var dobParsed = moment(dob, 'DDMMYYYY');
  return dobParsed.format('Do of MMMM YYYY')
}

/**
 * Converts 8 digit dates DDMMYYYY into long form human dates
 */
Handlebars.registerHelper('dateOfBirthHuman', function (a, options)
{
  if (a !== undefined && a !== null)
  {
    return formatDOB(a);
  }
  else
  {
    return a;
  }
});

/**
 * Formats ISO-8601 UTC dates into the call centres local timezone
 */
Handlebars.registerHelper('dateLocalHuman', function (a, b, options)
{
  if (a !== undefined && a !== null)
  {
    return moment(a).tz(b).format('Do of MMMM YYYY')
  }
  else
  {
    return a;
  }
});

/**
 * Formats ISO-8601 UTC dates into a human format in the format:
 * Thursday, the 5th of August, 2010
 */
Handlebars.registerHelper('dateFormat', function (a, b, options)
{
  if (a !== undefined && a !== null)
  {
    return moment(a).format(b)
  }
  else
  {
    return a;
  }
});

/**
 * Formats ISO-8601 UTC dates into a human date of birth format in the format:
 *  5th of August, 2010
 */
Handlebars.registerHelper('dateHuman', function (a, options)
{
  if (a !== undefined && a !== null)
  {
    return moment(a).format('Do of MMMM, YYYY')
  }
  else
  {
    return a;
  }
});

/**
 * Checks to see if value is a number
 */
function isNumber(value)
{
  if (value === undefined ||
      value === null ||
      value === '' ||
      value === 'true' ||
      value === 'false' ||
      isNaN(value))
  {
    return false;
  }
  else
  {
    return true;
  }
}

/**
 * Formats ISO-8601 UTC dates into the call centres local timezone and omits the year
 */
Handlebars.registerHelper('shortDateLocalHuman', function (a, b, options)
{
  if (a !== undefined && a !== null)
  {
    return moment(a).tz(b).format('Do of MMMM')
  }
  else
  {
    return a;
  }
});

/**
 * Formats ISO-8601 UTC dates into the call centres local timezone
 */
Handlebars.registerHelper('dayLocalHuman', function (a, b, options)
{
  if (a !== undefined && a !== null)
  {
    return moment(a).tz(b).format('dddd, Do of MMMM')
  }
  else
  {
    return a;
  }
});


/**
 * Formats ISO-8601 UTC dates into the call centres local timezone
 */
 Handlebars.registerHelper('dayOfMonthLocalHuman', function (a, b, options)
 {
   if (a !== undefined && a !== null)
   {
     return moment(a).tz(b).format('Do')
   }
   else
   {
     return a;
   }
 });

 /**
 * Formats ISO-8601 UTC dates into the call centres local timezone
 */
 Handlebars.registerHelper('monthLocalHuman', function (a, b, options)
 {
   if (a !== undefined && a !== null)
   {
     return moment(a).tz(b).format('MMMM')
   }
   else
   {
     return a;
   }
 });

/**
 * Formats ISO-8601 UTC dates into the call centres local timezone
 */
Handlebars.registerHelper('timeLocalHuman', function (a, b, options)
{
  if (a !== undefined && a !== null)
  {
    return moment(a).tz(b).format('h:mma')
  }
  else
  {
    return a;
  }
});

/**
 * Formats a time
 */
Handlebars.registerHelper('timeHuman', function (a, b, options)
{
  if (a !== undefined && a !== null)
  {
    return moment(a).format('h:mma')
  }
  else
  {
    return a;
  }
});

/**
 * Formats a standalone 24 hour time slot as 12 hour time
 */
Handlebars.registerHelper('timeSlotHuman', function (a, b, options)
{
  if (a !== undefined && a !== null)
  {
    return moment(a, ['h:m a', 'H:m']).format('h:mm a');
  }
  else
  {
    return a;
  }
});

/**
 * Renders a string character by character
 */
Handlebars.registerHelper('characterSpeechSlow', function (a, options)
{
  if (a !== undefined && a !== null)
  {
    var chars = Array.from(a);
    return chars.join(', ');
  }
  else
  {
    return a;
  }
});

/**
 * Renders a string character by character
 */
Handlebars.registerHelper('characterSpeechFast', function (a, options)
{
  if (a !== undefined && a !== null)
  {
   var chars = Array.from(a);
    return chars.join(' ');
  }
  else
  {
    return a;
  }
});

/**
 * Formats a cents amount as dollars
 */
Handlebars.registerHelper('formatCentsAsDollars', function (cents, options)
{
  if (cents !== undefined && cents !== null)
  {
    var dollars = (+cents * 0.01).toFixed(2);
    return `$${dollars}`;
  }
  else
  {
    return 'unknown dollars';
  }
});

/**
 * Formats Malaysian Ringgit
 */
Handlebars.registerHelper('formatRinggit', function (ringgit, options)
{
  if (ringgit !== undefined && ringgit !== null)
  {
    var wholeRinggit = Math.floor(ringgit);
    var sen = Math.floor((+ringgit % 1) * 100);

    if (sen > 0)
    {
      return `${wholeRinggit} ring-git, and ${sen} zen,`;
    }

    return `${wholeRinggit} ring-git,`;
  }
  else
  {
    return 'unknown ring-git';
  }
});

/**
 * Formats a balance cents amount as dollars handling credit cases
 */
Handlebars.registerHelper('formatBalanceCentsAsDollars', function (cents, options)
{
  if (cents !== undefined && cents !== null)
  {
    if (+cents < 0)
    {
      var dollars = (+cents * -0.01).toFixed(2);
      return `$${dollars} in credit`;
    }
    else
    {
      var dollars = (+cents * 0.01).toFixed(2);
      return `$${dollars}`;
    }
  }
  else
  {
    return 'unknown dollars';
  }
});

/**
 * Compiles and evaluates a Handlebars template
 */
 module.exports.template = function(templateCode, templateParams)
 {
   try
   {
     // Changes made to add LRU cache for complied handlebar templates. Story CONNECT-433
     var template = templatecache.get(templateCode);
     if (template !== undefined)
     {
       return template(templateParams);
     }
     template = Handlebars.compile(templateCode);
     templatecache.set(templateCode, template);
     return template(templateParams);
   }
   catch (error)
   {
     console.log('[ERROR] failed to compile and evaluate template', error);
     throw error;
   }
 }

/**
 * Compiles and evaluates a Handlebars template for each key in an object
 */
module.exports.templateMapObject = function(objectToTemplate, templateParams)
{
  var keys = Object.keys(objectToTemplate);

  keys.forEach(key => {
    if (module.exports.isTemplate(objectToTemplate[key]))
    {
      var templatedValue = module.exports.template(objectToTemplate[key], templateParams);
      objectToTemplate[key] = templatedValue;
    }
  });
}

/**
 * Checks to see if a string could be a template
 */
module.exports.isTemplate = function(value)
{
  if (value === undefined || value === null)
  {
    return false;
  }

  var stringValue = '' + value;

  if (stringValue.includes('{{') && stringValue.includes('}}'))
  {
    return true;
  }

  return false;
}

/**
 * Inspects each rule parameter to see if the handlebars compile.
 * @param ruleParams
 * @returns {{valid: boolean, lastFailedMessage: string}}
 */
module.exports.validateRuleParams = function (ruleParams) {
  // Key value pairs
  let valid = true
  let lastFailedError = null

  const messageKeys = Object.keys(ruleParams)
  messageKeys.forEach(key => {
    const val = ruleParams[key]
    if (module.exports.isTemplate(val)) {
      try {
        const compiled = Handlebars.compile(val)
        const result = compiled({})
      } catch (e) {
        valid = false
        e.message = `${key}: ${e.message}`
        lastFailedError = e
      }
    }
  })
  return {valid, lastFailedError}
}

