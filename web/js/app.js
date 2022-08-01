/**
  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.

  Licensed under the Apache License, Version 2.0 (the "License").
  You may not use this file except in compliance with the License.
  A copy of the License is located at

      http://www.apache.org/licenses/LICENSE-2.0

  or in the "license" file accompanying this file. This file is distributed
  on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
  express or implied. See the License for the specific language governing
  permissions and limitations under the License.
*/

/**
 * Router Declaration
 */
var router = null;

/**
 * Global site config object
 */
var siteConfig = null;
var navigationTemplate = null;
var batchResultSaveTemplate = null;

toastr.options = {
  "closeButton": true,
  "tapToDismiss": true,
  "positionClass": "toast-bottom-right",
  "showDuration": "300",
  "hideDuration": "1000",
  "timeOut": "5000",
  "extendedTimeOut": "2000",
  "showEasing": "swing",
  "hideEasing": "linear",
  "showMethod": "fadeIn",
  "hideMethod": "fadeOut"
};

function errorToast(message)
{
  clearAllToasts();
  toastr["error"](message, null, {
    timeOut: "10000",
    extendedTimeOut: "5000",
    alpha: 0
  });
}

function stickySuccessToast(message)
{
  clearAllToasts();
  toastr["success"](message, null, {
    timeOut: 0,
    extendedTimeOut: 0,
    alpha: 0
  });
}

function successToast(message)
{
  clearAllToasts();
  toastr["success"](message);
}

function clearAllToasts()
{
  toastr.clear();
}

/**
 * Formats a date for display
 */
function formatDate(dateString)
{
  var d = moment(dateString);
  return d.format('DD/MM/YYYY');
}


/**
 * Formats a date for display using the call centre's timezone
 */
function formatDateCallCentre(dateString)
{
  var d = moment(dateString).tz(siteConfig.callCentreTimeZone);
  return d.format('DD/MM/YYYY');
}

/**
 * Formats time for display
 */
function formatTime(dateString)
{
  var d = moment(dateString);
  return d.format('h:mma');
}

/**
 * Formats time for display
 */
function formatTimeCallCentre(dateString)
{
  var d = moment(dateString).tz(siteConfig.callCentreTimeZone);
  return d.format('h:mma');
}

function formatBatchRunDate(dateString)
{
  var d = moment(dateString).local();
  return d.format('DD/MM/YYYY hh:mma');
}

/**
 * Formats a date time for display
 */
function formatDateTime(dateString)
{
  var d = moment(dateString);
  return d.format('DD/MM/YYYY h:mma');
}

/**
 * Formats a date time for display
 */
function formatDateTimeCallCentre(dateString)
{
  var d = moment(dateString).tz(siteConfig.callCentreTimeZone);
  return d.format('DD/MM/YYYY h:mma');
}

/**
 * Sleep for time millis
 */
function sleep (time)
{
  return new Promise((resolve) => setTimeout(resolve, time));
}

/**
 * Handles dynamic routing from pages created post load
 */
function dynamicRoute(event)
{
  event.preventDefault();
  const pathName = event.target.hash;
  router.navigateTo(pathName);
}

/**
 * Stores a string in session storage
 */
function store(key, value)
{
  window.localStorage.setItem(key, value);
}

/**
 * Stores an object as JSON in local storage
 */
function storeObject(key, object)
{
  store(key, JSON.stringify(object, null, '  '));
}

/**
 * Unstores a string in local storage
 */
function unstore(key)
{
  return window.localStorage.getItem(key);
}

/**
 * Unstores a string in local storage returning
 * the default if not set
 */
function unstoreDefault(key, defaultValue)
{
  if (isStored(key))
  {
    return window.localStorage.getItem(key);
  }
  else
  {
    return defaultValue;
  }
}

/**
 * Unstores an object from JSON in local storage
 */
function unstoreObject(key)
{
  if (!isStored(key))
  {
    console.log('[ERROR] failed to locate object in local store using key: ' + key);
    return null;
  }

  let value = unstore(key);
  return JSON.parse(value);
}

/**
 * Checks to see if something is stored
 */
function isStored(key)
{
  return window.localStorage.getItem(key) !== null;
}

function clearStorage(key)
{
  window.localStorage.removeItem(key);
}

/**
 * Clears all of local store
 */
function clearLocalStorage()
{
  console.info('Clearing local storage');
  for (var key in localStorage)
  {
    clearStorage(key);
  }
}

function clone(object)
{
  return JSON.parse(JSON.stringify(object));
}

function isValidText(text)
{
  var validText = /^[a-zA-Z0-9\,\.\'\-\?\!\s]*$/g;
  return text.match(validText);
}

async function checkLogin(apiKey)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': apiKey
      }
    };

    var response = await axios.post(siteConfig.api + '/login', {}, options);
    return response.data.user;
  }
  catch (error)
  {
    logError('[ERROR] Failed to verify login', error);
    return undefined;
  }
}

function isJavascriptObject(myObject)
{
  if (typeof myObject === 'object' &&
      !Array.isArray(myObject) &&
      myObject !== null)
  {
    return true;
  }

  return false;
}

// See: https://github.com/janl/mustache.js/blob/master/mustache.js
function escapeHtml(string)
{
  var entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };

  return String(string).replace(/[&<>"'`=]/g, function fromEntityMap (s)
  {
    return entityMap[s];
  });
}

/**
 * Check if user logged in
 * Check for User Role change
 */
async function loginSafetyCheck() {
  console.log("[INFO] Performing login check");
  if (isLoggedIn())
  {
    var apiKey = unstore('api-key');
    var user = await checkLogin(apiKey);
    if (!user)
    {
      forceLogout("Invalid API Key");
    }
    else
    {
      var userRoleChanged = user.userRole !== unstoreObject('user').userRole;
      if (userRoleChanged) forceLogout("Role has changed");
    }
  }
}

function getUserEmail()
{
  var loggedIn = isStored('api-key') && isStored('user');

  if (loggedIn)
  {
    return unstoreObject('user').emailAddress;
  }
  else
  {
    return undefined;
  }
}

function isLoggedIn()
{
  var loggedIn = isStored('api-key') && isStored('user');

  if (!loggedIn)
  {
    clearLoggedInData();
  }

  return loggedIn;
}

/**
 * Checks for admin level access
 */
function isAdmin()
{
  if (!isLoggedIn())
  {
    return false;
  }

  return unstoreObject('user').userRole === 'ADMINISTRATOR';
}

/**
 * Checks for power user level access
 */
function isPowerUser()
{
  if (!isLoggedIn())
  {
    return false;
  }

  return unstoreObject('user').userRole === 'POWER_USER';
}

/**
 * Checks for tester level access
 */
function isTester()
{
  if (!isLoggedIn())
  {
    return false;
  }

  return unstoreObject('user').userRole === 'TESTER';
}

/**
 * Force logout for a user
 */
function forceLogout(message)
{
  clearLoggedInData();
  console.log('[INFO] You have been logged out: ' + message);
  errorToast('You have been logged out ' + message);
  $('.modal-backdrop').hide();
  window.location.hash = '#';
}

/**
 * Fired once on page load, sets up the router
 * and navigates to current hash location
 */
window.addEventListener('load', async () =>
{

 /**
   * Make sure the app-body div is always the right height
   */
  function resizeBody()
  {
    var headerHeight = $('.navbar').height();
    var appBodyHeight = $(window).height() - headerHeight;
    $('.body-div').css({
        'height' : appBodyHeight + 'px'
    });
  }

  $('document').ready(function(){
    resizeBody();
  });

  $(window).resize(function() {
    resizeBody();
  });

  /**
   * Set up the vanilla router
   */
  router = new Router({
    mode: 'hash',
    root: '/index.html',
    page404: function (path)
    {
      console.log('[WARN] page not found: ' + path);
      window.location.hash = '#';
    }
  });

  Handlebars.registerHelper('inc', function(value, options)
  {
    return parseInt(value) + 1;
  });

  Handlebars.registerHelper('times', function(n, block)
  {
    var accum = '';
    for(var i = 0; i < n; ++i)
    {
        accum += block.fn(i);
    }
    return accum;
  });

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

  Handlebars.registerHelper('testLine', function(result, options)
  {
    if (result.success !== true)
    {
      return 'test-error';
    }
    else if (result.warning === true)
    {
      return 'test-warning';
    }
    else
    {
      return 'test-success';
    }
  });

  Handlebars.registerHelper('coverageLine', function(coverage, options)
  {
    if (coverage === 100)
    {
      return 'coverage-covered';
    }
    else if (coverage > 0)
    {
      return 'coverage-partial';
    }
    else
    {
      return 'coverage-uncovered';
    }
  });

  Handlebars.registerHelper('testWrapper', function(test, options)
  {
    if (test.success !== true)
    {
      return 'test-wrapper-error';
    }
    else if (test.warning === true)
    {
      return 'test-wrapper-warning';
    }
    else
    {
      return 'test-wrapper-success';
    }
  });

  Handlebars.registerHelper('testStatus', function(test, options)
  {
    if (test.success !== true)
    {
      return 'ERROR';
    }

    if (test.warning === true)
    {
      return 'WARNING';
    }
    else
    {
      return 'SUCCESS';
    }
  });

  Handlebars.registerHelper('batchStatus', function(batch, options)
  {
    if (batch.status === 'RUNNING')
    {
      return batch.status;
    }

    if (batch.success !== true)
    {
      return 'ERROR';
    }

    if (batch.warning === true)
    {
      return 'WARNING';
    }
    else
    {
      return 'SUCCESS';
    }
  });

  Handlebars.registerHelper('batchTitle', function(result, options)
  {
    if (result.complete === false)
    {
      return '';
    }
    else if (result.success !== true)
    {
      return 'bg-danger text-white';
    }
    else if (result.warning === true)
    {
      return 'bg-warning text-white';
    }
    else
    {
      return 'bg-success text-white';
    }
  });

  Handlebars.registerHelper('default', function(options)
  {
    if (this.switch_break == false)
    {
      return options.fn(this);
    }
  });

  Handlebars.registerHelper('checked', function(currentValue) {
    return currentValue ? ' checked="checked"' : '';
  });

  Handlebars.registerHelper('json', function(context) {
    return JSON.stringify(context);
  });

  Handlebars.registerHelper('ifeq', function (a, b, options) {
    if (a == b) { return options.fn(this); }
    return options.inverse(this);
  });

  Handlebars.registerHelper('ifnoteq', function (a, b, options) {
    if (a != b) { return options.fn(this); }
    return options.inverse(this);
  });

  Handlebars.registerHelper('each_upto', function(ary, max, options) {
    if (!ary || ary.length === 0)
    {
      return options.inverse(this);
    }
    var result = [];
    for (var i = 0; i < max && i < ary.length; ++i)
    {
      result.push(options.fn(ary[i]));
    }
    return result.join('');
  });

  Handlebars.registerHelper('formatDate', function (a, options)
  {
    return formatDate(a);
  });

  Handlebars.registerHelper('formatDateTime', function (a, options)
  {
    return formatDateTime(a);
  });

  Handlebars.registerHelper('formatBatchRunDate', function (a, options)
  {
    return formatBatchRunDate(a);
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
      return '$0.00';
    }
  });

  Handlebars.registerHelper('ifCond', function (v1, operator, v2, options)
  {
    switch (operator) {
      case '==':
          return (v1 == v2) ? options.fn(this) : options.inverse(this);
      case '===':
          return (v1 === v2) ? options.fn(this) : options.inverse(this);
      case '!=':
          return (v1 != v2) ? options.fn(this) : options.inverse(this);
      case '!==':
          return (v1 !== v2) ? options.fn(this) : options.inverse(this);
      case '<':
          return (v1 < v2) ? options.fn(this) : options.inverse(this);
      case '<=':
          return (v1 <= v2) ? options.fn(this) : options.inverse(this);
      case '>':
          return (v1 > v2) ? options.fn(this) : options.inverse(this);
      case '>=':
          return (v1 >= v2) ? options.fn(this) : options.inverse(this);
      case '&&':
          return (v1 && v2) ? options.fn(this) : options.inverse(this);
      case '||':
          return (v1 || v2) ? options.fn(this) : options.inverse(this);
      default:
          return options.inverse(this);
    }
  });

  Handlebars.registerHelper('select', function(selected, options) {
    return options.fn(this).replace(
        new RegExp(' value=\"' + selected + '\"'), '$& selected="selected"'
    );
  });

  Handlebars.registerHelper('checked', function(state) {
    if (state === 'true' || state === true)
    {
      return 'checked';
    }
    return '';
  });

  /**
   * Load site configuration and Handlebars templates
   * and compile them after they are all loaded
   */
  $.when(
    $.get('config/site_config.json'),
    $.get('templates/navigation.hbs'),
    $.get('templates/home.hbs'),
    $.get('templates/configure.hbs'),
    $.get('templates/configureRuleSet.hbs'),
    $.get('templates/configureRule.hbs'),
    $.get('templates/graph.hbs'),
    $.get('templates/test.hbs'),
    $.get('templates/batchResult.hbs'),
    $.get('templates/batchResults.hbs'),
    $.get('templates/batchResultSave.hbs'),
    $.get('templates/interact.hbs'),
    $.get('templates/admin.hbs'),
    $.get('templates/endpoints.hbs'),
    $.get('templates/holidays.hbs'),
    $.get('templates/help.hbs'),
    $.get('templates/login.hbs'),
    $.get('templates/logout.hbs')
  ).done(function(site,
      navigation,
      home,
      configure,
      configureRuleSet,
      configureRule,
      graph,
      test,
      batchResult,
      batchResults,
      batchResultSave,
      interact,
      admin,
      endpoints,
      holidays,
      help,
      login,
      logout)
  {
    try
    {
      siteConfig = site[0];

      console.log('[INFO] loaded site configuration, current version: ' + siteConfig.version);

      //check login whenever page loads
      loginSafetyCheck();

      navigationTemplate = Handlebars.compile(navigation[0]);
      let homeTemplate = Handlebars.compile(home[0]);
      let configureTemplate = Handlebars.compile(configure[0]);
      let configureRuleSetTemplate = Handlebars.compile(configureRuleSet[0]);
      let configureRuleTemplate = Handlebars.compile(configureRule[0]);
      let graphTemplate = Handlebars.compile(graph[0]);
      let testTemplate = Handlebars.compile(test[0]);
      let batchResultTemplate = Handlebars.compile(batchResult[0]);
      let batchResultsTemplate = Handlebars.compile(batchResults[0]);
      batchResultSaveTemplate = Handlebars.compile(batchResultSave[0]);
      let interactTemplate = Handlebars.compile(interact[0]);
      let adminTemplate = Handlebars.compile(admin[0]);
      let endPointsTemplate = Handlebars.compile(endpoints[0]);
      let holidaysTemplate = Handlebars.compile(holidays[0]);
      let helpTemplate = Handlebars.compile(help[0]);
      let loginTemplate = Handlebars.compile(login[0]);
      let logoutTemplate = Handlebars.compile(logout[0]);

      /**
       * Home
       */
      router.add('', async () =>
      {
        loading();
        renderNavigation('#navHome');

        if (isLoggedIn())
        {
          var lastChange = await getLastChangeTimestamp();

          await refreshConnectData(lastChange);
          await refreshRuleSets(lastChange);
        }

        var html = homeTemplate({
          siteConfig: siteConfig
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Holidays editor
       */
      router.add('holidays', async () =>
      {

        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        loading();
        renderNavigation('#navHolidays');

        var lastChange = await getLastChangeTimestamp();
        await refreshConnectData(lastChange);

        var holidays = await getHolidays();

        var html = holidaysTemplate({
          siteConfig: siteConfig,
          tester: isTester(),
          holidays: holidays
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Configure
       */
      router.add('configure', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navConfigure');
        loading();

        const queryParams = new URLSearchParams(window.location.search);

        var folder = queryParams.get('folder');
        var recursiveRuleSets = unstore('recursiveRuleSets') === 'true';

        var breadcrumbs = [ '' ];
        if (folder != undefined && folder != null && folder !== '/' && folder !== '')
        {
          breadcrumbs = folder.split('/');
        }
        else
        {
          folder = '/';
        }

        // Restrict the number of active breadcrumbs
        if (breadcrumbs.length > 5)
        {
          breadcrumbs.splice(1, breadcrumbs.length - 5, '...');
        }

        var lastChange = await getLastChangeTimestamp();
        await refreshConnectData(lastChange);
        var ruleSets = await refreshRuleSets(lastChange);
        var endPoints = await refreshEndPoints(lastChange);
        var availableEndPoints = getAvailableEndPoints(endPoints, ruleSets);

        var treeModel = buildRuleSetTree(ruleSets);

        if (!recursiveRuleSets)
        {
          ruleSets = ruleSets.filter(ruleSet => ruleSet.folder === folder);
        }
        else
        {
          ruleSets = ruleSets.filter(ruleSet => ruleSet.folder.startsWith(folder));
        }

        var html = configureTemplate({
          siteConfig: siteConfig,
          ruleSets: ruleSets,
          folder: folder,
          recursiveRuleSets: recursiveRuleSets,
          treeModel: treeModel,
          breadcrumbs: breadcrumbs,
          availableEndPoints: availableEndPoints,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Graph
       */
      router.add('graph', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navGraph');
        loading();

        var lastChange = await getLastChangeTimestamp();
        await refreshConnectData(lastChange);
        var ruleSets = await refreshRuleSets(lastChange);

        var html = graphTemplate({
          siteConfig: siteConfig,
          ruleSets: ruleSets,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Configure rule set
       */
      router.add('configureRuleSet', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navConfigure');
        loading();

        const queryParams = new URLSearchParams(window.location.search);

        var ruleSetId = queryParams.get('ruleSetId');
        var folder = queryParams.get('folder');

        if (ruleSetId === null)
        {
          window.location.hash = '#configure';
          return;
        }

        var lastChange = await getLastChangeTimestamp();
        await refreshConnectData(lastChange);
        var ruleSets = await refreshRuleSets(lastChange);
        var endPoints = await refreshEndPoints(lastChange);
        var availableEndPoints = getAvailableEndPoints(endPoints, ruleSets);

        var ruleSet = await getRuleSet(ruleSetId);

        if (ruleSet == null || ruleSet === undefined)
        {
          errorToast('Failed to load rule set');
          await sleep(1000);
          window.location.hash = '#configure';
          return;
        }

        var breadcrumbs = [ '' ];

        if (folder !== undefined && folder !== null && folder !== '/' && folder !== '')
        {
          breadcrumbs = folder.split('/');
          breadcrumbs.push(ruleSet.name);
        }
        else
        {
          folder = '/';
        }

        // Restrict the number of active breadcrumbs
        if (breadcrumbs.length > 4)
        {
          breadcrumbs.splice(1, breadcrumbs.length - 4, '...');
        }

        var queues = unstoreObject('queues');
        var contactFlows = unstoreObject('contactFlows');

        var lexBots = unstoreObject('lexBots');

        if (lexBots === undefined)
        {
          lexBots = [];
        }

        var ruleSetsNames = [];

        ruleSets.forEach(rs => {
          ruleSetsNames.push(rs.name);
        });

        console.log('[INFO] loaded rule set: ' + JSON.stringify(ruleSet, null, 2));

        var operatingHours = unstoreObject('operatingHours');

        if (operatingHours === undefined)
        {
          operatingHours = [];
        }

        var validActionNames = getValidActionNames();

        var functions = unstoreObject('lambdaFunctions');
        var filteredFunctions = functions.filter(lambdaFunction => lambdaFunction.Name.includes('-integration'));

        var integrationFunctions = [];

        filteredFunctions.forEach(lambdaFunction => {
          var index = lambdaFunction.Name.indexOf('integration');
          integrationFunctions.push(lambdaFunction.Name.substring(index));
        });

        var prompts = unstoreObject('prompts');

        var html = configureRuleSetTemplate({
          siteConfig: siteConfig,
          ruleSet: ruleSet,
          ruleSetsNames: ruleSetsNames,
          breadcrumbs: breadcrumbs,
          queues: queues,
          folder: folder,
          prompts: prompts,
          lexBots: lexBots,
          operatingHours: operatingHours,
          contactFlows: contactFlows,
          availableEndPoints: availableEndPoints,
          integrationFunctions: integrationFunctions,
          validActionNames: validActionNames,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Configure rule
       */
      router.add('configureRule', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navConfigure');
        loading();

        const queryParams = new URLSearchParams(window.location.search);

        var ruleId = queryParams.get('ruleId');
        var ruleSetId = queryParams.get('ruleSetId');
        var folder = queryParams.get('folder');

        var lastChange = await getLastChangeTimestamp();
        await refreshConnectData(lastChange);
        var ruleSets = await refreshRuleSets(lastChange);

        var queues = unstoreObject('queues');
        var contactFlows = unstoreObject('contactFlows');

        if (ruleSetId === null || ruleId === null)
        {
          window.location.hash = '#configure';
          return;
        }

        var lexBots = unstoreObject('lexBots');

        if (lexBots === undefined)
        {
          lexBots = [];
        }

        var ruleSet = ruleSets.find(rs => rs.ruleSetId === ruleSetId);

        if (ruleSet == null || ruleSet === undefined)
        {
          window.location.hash = '#configure';
          return;
        }

        var rule = await getRule(ruleSetId, ruleId);

        if (rule == null || rule === undefined)
        {
          window.location.hash = '#configure';
          return;
        }

        var ruleSetsNames = [];
        var ruleSetsNameId = [];

        ruleSets.forEach(rs => {
          ruleSetsNames.push(rs.name);

          ruleSetsNameId.push({
            name: rs.name,
            id: rs.ruleSetId
          })
        });

        var operatingHours = unstoreObject('operatingHours');

        if (operatingHours === undefined)
        {
          operatingHours = [];
        }

        var breadcrumbs = [ '' ];

        if (folder !== undefined && folder !== null && folder !== '/' && folder !== '')
        {
          breadcrumbs = folder.split('/');
          breadcrumbs.push(ruleSet.name);
          breadcrumbs.push(rule.name);
        }
        else
        {
          folder = '/';
        }

        // Restrict the number of active breadcrumbs
        if (breadcrumbs.length > 4)
        {
          breadcrumbs.splice(1, breadcrumbs.length - 4, '...');
        }

        var validActionNames = getValidActionNames();

        var functions = unstoreObject('lambdaFunctions');
        var filteredFunctions = functions.filter(lambdaFunction => lambdaFunction.Name.includes('-integration'));

        var integrationFunctions = [];

        filteredFunctions.forEach(lambdaFunction => {
          var index = lambdaFunction.Name.indexOf('integration');
          integrationFunctions.push(lambdaFunction.Name.substring(index));
        });

        var prompts = unstoreObject('prompts');

        var html = configureRuleTemplate({
          siteConfig: siteConfig,
          queues: queues,
          prompts: prompts,
          lexBots: lexBots,
          folder: folder,
          breadcrumbs: breadcrumbs,
          operatingHours: operatingHours,
          contactFlows: contactFlows,
          integrationFunctions: integrationFunctions,
          rule: rule,
          ruleSet: ruleSet,
          ruleSetsNameId: ruleSetsNameId,
          ruleSetsNames: ruleSetsNames,
          validActionNames: validActionNames,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Tests
       */
      router.add('test', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navTest');
        loading();

        const queryParams = new URLSearchParams(window.location.search);

        var folder = queryParams.get('folder');
        var testId = queryParams.get('testId');
        var recursiveTests = unstore('recursiveTests') === 'true';

        // Check to see if a test id was provided for instant editing
        if (testId === null)
        {
          testId = undefined;
        }

        var breadcrumbs = [ '' ];
        if (folder != undefined && folder != null && folder !== '/' && folder !== '')
        {
          breadcrumbs = folder.split('/');
        }
        else
        {
          folder = '/';
        }

        // Restrict the number of active breadcrumbs
        if (breadcrumbs.length > 5)
        {
          breadcrumbs.splice(1, breadcrumbs.length - 5, '...');
        }

        var lastChange = await getLastChangeTimestamp();
        await refreshConnectData(lastChange);
        var tests = await refreshTests(lastChange);
        var endPoints = await refreshEndPoints(lastChange);
        var testTreeModel = buildTestsTree(tests);

        if (!recursiveTests)
        {
          tests = tests.filter(test => test.folder === folder);
        }
        else
        {
          tests = tests.filter(test => test.folder.startsWith(folder));
        }

        var html = testTemplate({
          siteConfig: siteConfig,
          tests: tests,
          testId: testId, // edit immediately
          folder: folder,
          testTreeModel: testTreeModel,
          breadcrumbs: breadcrumbs,
          recursiveTests: recursiveTests,
          endPoints: endPoints,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * View all batch results
       */
      router.add('batchResults', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navTest');
        loading();

        const queryParams = new URLSearchParams(window.location.search);

        var mineOnly = queryParams.get('mineOnly') === 'true';
        var errorsOnly = queryParams.get('errorsOnly') === 'true';

        var batches = await getBatches(mineOnly, errorsOnly);

        if (batches === undefined)
        {
          window.location.hash = '#test';
          return;
        }

        var html = batchResultsTemplate({
          siteConfig: siteConfig,
          batches: batches,
          mineOnly: mineOnly,
          errorsOnly: errorsOnly,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * View a single batch result
       */
      router.add('batchResult', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navTest');
        loading();

        const queryParams = new URLSearchParams(window.location.search);

        var batchId = queryParams.get('batchId');

        var batch = await getBatch(batchId);

        if (batch === undefined)
        {
          window.location.hash = '#test';
          return;
        }

        console.info(JSON.stringify(batch, null, 2));

        try
        {
          var html = batchResultTemplate({
            siteConfig: siteConfig,
            batch: batch,
            administrator: isAdmin(),
            powerUser: isPowerUser(),
            tester: isTester()
          });
          $('#bodyDiv').html(html);
        }
        catch (error)
        {
          console.error('Failed to render batch results page', error);
        }
      });

      /**
       * View a single batch for saving
       */
      router.add('batchResultSave', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        loading();

        const queryParams = new URLSearchParams(window.location.search);

        var batchId = queryParams.get('batchId');

        var testId = queryParams.get('testId');

        var batch = await getBatch(batchId);

        if (batch === undefined)
        {
          window.location.hash = '#test';
          return;
        }

        // Filter the results to this one test id
        if (testId !== null)
        {
          batch.testIds = batch.testIds.filter(tId => tId === testId);

          if (batch.testIds.length !== 1)
          {
            window.location.hash = '#test';
            return;
          }

          batch.results = batch.results.filter(result => result.testId === testId);
          batch.testCount = 1;
          batch.success = batch.results[0].success;
          batch.warning = batch.results[0].warning === true;
        }

        try
        {
          var html = batchResultSaveTemplate({
            siteConfig: siteConfig,
            batch: batch
          });

          document.querySelector('html').innerHTML = html;
        }
        catch (error)
        {
          console.error('Failed to render batch results save page', error);
        }
      });

      /**
       * Help
       */
      router.add('help', async () =>
      {

        renderNavigation('#navHelp');
        loading();

        var html = helpTemplate({
          siteConfig: siteConfig,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Interact
       */
      router.add('interact', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navInteract');
        loading();

        const queryParams = new URLSearchParams(window.location.search);

        var batchId = queryParams.get('batchId');
        var testId = queryParams.get('testId');
        var test = undefined;
        var testResult = undefined;

        if (batchId !== null && testId !== null)
        {
          var batch = await getBatch(batchId);
          var testResult = batch.results.find(result => result.testId === testId);
          var test = await getTest(testId);
        }

        var lastChange = await getLastChangeTimestamp();
        await refreshConnectData(lastChange);
        var ruleSets = await refreshRuleSets(lastChange);
        var endPoints = await refreshEndPoints(lastChange);
        var allocatedEndPoints = getAllocatedEndPoints(endPoints, ruleSets);

        var html = interactTemplate({
          siteConfig: siteConfig,
          test: test,
          testResult: testResult,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester(),
          allocatedEndPoints: allocatedEndPoints
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Admin
       */
      router.add('admin', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        if (!isAdmin())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navAdmin');
        loading();

        var users = await getUsers();

        var html = adminTemplate({
          siteConfig: siteConfig,
          users: users,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * End points
       */
      router.add('endpoints', async () =>
      {
        if (!isLoggedIn())
        {
          window.location.hash = '#';
          return;
        }

        renderNavigation('#navEndPoints');
        loading();

        var lastChange = await getLastChangeTimestamp();
        await refreshConnectData(lastChange);
        var endPoints = await refreshEndPoints(lastChange);

        var phoneNumbers = unstoreObject('phoneNumbers');

        if (phoneNumbers === undefined)
        {
          phoneNumbers = [];
        }

        var claimed = new Set();

        endPoints.forEach(ep => {
          ep.inboundNumbers.forEach(phone => {
            claimed.add(phone);
          });
        });

        var availableNumbers = phoneNumbers.filter(phoneNumber => !claimed.has(phoneNumber.PhoneNumber));

        var html = endPointsTemplate({
          siteConfig: siteConfig,
          endPoints: endPoints,
          availableNumbers: availableNumbers,
          administrator: isAdmin(),
          powerUser: isPowerUser(),
          tester: isTester()
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Login
       */
      router.add('login', async () =>
      {
        renderNavigation('#navLogin');
        var html = loginTemplate({
          siteConfig: siteConfig
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Logout
       */
      router.add('logout', async () =>
      {
        renderNavigation('#navLogout');
        var html = logoutTemplate({
          siteConfig: siteConfig
        });
        $('#bodyDiv').html(html);
      });

      /**
       * Make hash links work
       */
      router.addUriListener()

      /**
       * Load the current fragment
       */
      router.check();
    }
    catch (error)
    {
      console.log('[ERROR] encountered an issue building site', error)
      alert('Encountered an issue building site: ' + error.message);
    }
  });
});

/**
 * Helper that renders out a link to a rule set
 */
function buildConfigureRuleSetLink(ruleSetId, overrideFolder = undefined)
{
  let searchParams = new URLSearchParams(window.location.search);
  searchParams.set('ruleSetId', ruleSetId);

  if (overrideFolder !== undefined)
  {
    searchParams.set('folder', overrideFolder)
  }

  var url = `/?${searchParams.toString()}#configureRuleSet`;

  return url;
}

/**
 * Helper that renders out a link to a rule
 */
function buildConfigureRuleLink(ruleSetId, ruleId, overrideFolder = undefined)
{
  let searchParams = new URLSearchParams(window.location.search);
  searchParams.set('ruleSetId', ruleSetId);
  searchParams.set('ruleId', ruleId);

  if (overrideFolder !== undefined)
  {
    searchParams.set('folder', overrideFolder)
  }

  var url = `/?${searchParams.toString()}#configureRule`;

  return url;
}

function renderNavigation(page)
{
  $('#headerDiv').show();

  var user = undefined;

  if (isLoggedIn())
  {
    user = unstoreObject('user');
  }

  var html = navigationTemplate({
    siteConfig: siteConfig,
    page: page,
    loggedIn: isLoggedIn(),
    admin: isAdmin(),
    user: user
  });
  $('#navbarCollapse').html(html);
  highlightNav(page);
}

function highlightNav(pageId)
{
  $('.active').removeClass('active');
  $(pageId).addClass('active');
}

function loading()
{
  $('#bodyDiv').html('<div class="text-center"><img src="img/loading.gif" class="img-fluid" alt="Loading..."></div>');
}

/**
 * Filters end points for those that are available to allocate
 */
function getAvailableEndPoints(endPoints, ruleSets)
{
  var availableEndPoints = [];

  endPoints.forEach(endPoint => {
    var available = true;
    ruleSets.forEach(ruleSet => {
      if (ruleSet.endPoints.includes(endPoint.name))
      {
        available = false;
      }
    });

    if (available)
    {
      availableEndPoints.push(endPoint);
    }
  });

  availableEndPoints.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });

  return availableEndPoints;
}

/**
 * Filters end point for those that are already allocated
 */
function getAllocatedEndPoints(endPoints, ruleSets)
{
  var allocatedEndPoints = [];

  endPoints.forEach(endPoint => {
    var allocated = false;
    ruleSets.forEach(ruleSet => {
      if (ruleSet.endPoints.includes(endPoint.name))
      {
        allocated = true;
      }
    });

    if (allocated)
    {
      allocatedEndPoints.push(endPoint);
    }
  });

  allocatedEndPoints.sort(function (a, b) {
    return a.name.localeCompare(b.name);
  });

  return allocatedEndPoints;
}



/**
 * Clears all logged in data
 */
function clearLoggedInData()
{
  clearLocalStorage();
}

/**
 * Logs an error handling axios error body if present
 */
function logError(message, error)
{
  if (error.response != undefined && error.response.data != undefined)
  {
    console.log(message, JSON.stringify(error.response.data, null, 2));
  }
  else
  {
    console.log(message, error);
  }
}

/**
 * Extracts the error message from an error
 */
function extractErrorMessage(error)
{
  if (error.response != undefined && error.response.data != undefined)
  {
    return error.response.data.error;
  }
  else
  {
    return error.message;
  }
}

/**
 * Loads all users requires ADMINISTRATOR
 */
async function getUsers()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/users`, options);

    var users = response.data.users;

    return users;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load users', error);
    errorToast('Failed to load users');

    if (error.response.status === 401)
    {
      forceLogout('Failed to load users')
    }
    return [];
  }
}

/**
 * Deeply loads all rule sets
 */
async function getRuleSetsForExport()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    successToast('Loading Rule Sets for export...');

    var response = await axios.get(`${siteConfig.api}/rulesetsforexport`, options);

    var ruleSets = response.data.ruleSets;

    return ruleSets;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule sets', error);
    errorToast('Failed to load rule sets');

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to load rule sets')
    }
    return [];
  }
}

/**
 * Deeply loads all rule sets for CSV
 */
async function getRuleSetsForCSVExport()
{

  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    successToast('Loading Rule Sets for export...');

    var response = await axios.get(`${siteConfig.api}/rulesetsforcsvexport`, options);

    var ruleSets = response.data.csvData;

    return ruleSets;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule sets', error);
    errorToast('Failed to load rule sets');

    if (error.response.status === 401)
    {
      forceLogout('Failed to load rule sets')
    }
    return null;
  }
}

/**
 * Import rule sets
 */
async function importRuleSets(ruleSets)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var body = {
      ruleSets: ruleSets
    };

    await axios.post(`${siteConfig.api}/rulesetsimport`, body, options);
  }
  catch (error)
  {
    logError('[ERROR] Failed to import rule sets', error);
    errorToast('Failed to import rule sets');

    if (error.response.status === 401)
    {
      forceLogout('Failed to import rule sets')
    }
    throw error;
  }
}

/**
 * Post import rule sets
 */
async function postImportRuleSets(importedRuleSets)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var body = {
      importedRuleSets: importedRuleSets
    };

    var response = await axios.post(`${siteConfig.api}/postrulesetsimport`, body, options);

    var deletedCount = +response.data.deletedCount;
    console.log(`[INFO] deleted: ${deletedCount} dangling rule sets`);
    return deletedCount;
  }
  catch (error)
  {
    logError('[ERROR] Failed to perform post import actions', error);
    errorToast('Failed to perform post import actions');
    if(error.response.status === 401){
      forceLogout('Failed to perform post import actions')
    }
    throw error;
  }
}


/**
 * Import tests
 */
async function importTests(tests)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var body = {
      tests: tests
    };

    var result = await axios.post(`${siteConfig.api}/testsimport`, body, options);
    return result.data;
  }
  catch (error)
  {
    logError('[ERROR] Failed to import tests', error);
    errorToast('Failed to import tests');

    if (error.response.status === 401)
    {
      forceLogout('Failed to import tests')
    }
    throw error;
  }
}

/**
 * Post import rule sets
 */
async function postImportTests(importedTests)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var body = {
      importedTests: importedTests
    };

    var response = await axios.post(`${siteConfig.api}/posttestsimport`, body, options);

    var deletedCount = +response.data.deletedCount;
    console.log(`[INFO] deleted: ${deletedCount} dangling tests`);
    return deletedCount;
  }
  catch (error)
  {
    logError('[ERROR] Failed to perform post import actions', error);
    errorToast('Failed to perform post import actions');
    if(error.response.status === 401){
      forceLogout('Failed to perform post import actions')
    }
    throw error;
  }
}


/**
 * Fetches the time of last change from the remote server
 * to avoid large remote loads
 */
async function getLastChangeTimestamp()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/lastchange`, options);

    console.log('[INFO] found last remote change: ' + response.data.lastChangeTimestamp);

    return response.data.lastChangeTimestamp;
  }
  catch (error)
  {
    console.log('[ERROR] failed to load timestamp of last change', error);

    if (error.response.status === 401)
    {
      forceLogout('failed to load timestamp of last change')
    }
    throw error;
  }
}

/**
 * Checks to see if the cache is valid passing the
 * key that stores the timestamp and the last remote change
 */
function isCacheValid(timestampKey, lastChange)
{
  var lastLoad = unstore(timestampKey);

  if (lastLoad === null)
  {
    return false;
  }

  // If the last reported remote change is after out last load
  // then the cache is invalid
  if (moment(lastChange).isAfter(moment(lastLoad)))
  {
    return false;
  }

  return true;
}

/**
 * Refreshes end points sets, using a local cache when possible

 */
async function refreshEndPoints(lastChange)
{
  try
  {
    if (isCacheValid('endPointsTimestamp', lastChange) && isStored('endPoints'))
    {
      return unstoreObject('endPoints');
    }

    clearStorage('endPoints');
    clearStorage('endPointsTimestamp');
    console.log('[INFO] loading remote end points');

    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/endpoints`, options);

    var endPoints = response.data.endPoints;

    storeObject('endPoints', endPoints);
    store('endPointsTimestamp', lastChange);

    return endPoints;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load end points', error);
    errorToast('Failed to load end points');

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to load end points')
    }
    return [];
  }
}

/**
 * Refreshes tests, using a local cache when possible
 */
async function refreshTests(lastChange)
{
  try
  {
    if (isCacheValid('testsTimestamp', lastChange) && isStored('tests'))
    {
      return unstoreObject('tests');
    }

    clearStorage('tests');
    clearStorage('testsTimestamp');
    console.log('[INFO] loading remote tests');

    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/tests`, options);

    var tests = response.data.tests;

    storeObject('tests', tests);
    store('testsTimestamp', lastChange);

    return tests;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load tests', error);
    errorToast('Failed to load tests');

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to load tests')
    }
    return [];
  }
}


/**
 * Refreshes rule sets, using a local cache when possible
 */
async function refreshRuleSets(lastChange)
{
  try
  {
    if (isCacheValid('ruleSetsTimestamp', lastChange) && isStored('ruleSets'))
    {
      return unstoreObject('ruleSets');
    }

    clearStorage('ruleSets');
    clearStorage('ruleSetsTimestamp');
    console.log('[INFO] loading remote rule sets');

    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/rulesets`, options);

    var ruleSets = response.data.ruleSets;

    storeObject('ruleSets', ruleSets);
    store('ruleSetsTimestamp', lastChange);

    return ruleSets;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule sets', error);
    errorToast('Failed to load rule sets');

    if (error.response.status === 401)
    {
      forceLogout('Failed to load rule sets')
    }
    return [];
  }
}

/**
 * Loads the graph for all rule sets
 */
async function getRuleSetsGraph()
{
  try
  {
    var lastChange = await getLastChangeTimestamp();

    if (isCacheValid('ruleSetsGraphTimestamp', lastChange) && isStored('ruleSetsGraph'))
    {
      return unstoreObject('ruleSetsGraph');
    }

    clearStorage('ruleSetsGraph');
    clearStorage('ruleSetsGraphTimestamp');
    console.log('[INFO] loading remote rule sets graph');

    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/rulesetsgraph`, options);

    var graphData = response.data;

    graphData.nodes.forEach(node => {
      node.labelLower = node.label.toLowerCase();
      node.titleLower = node.title.toLowerCase();
    });

    storeObject('ruleSetsGraph', graphData);
    store('ruleSetsGraphTimestamp', lastChange);

    return graphData;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule sets graph', error);
    errorToast('Failed to load rule sets graph');

    if (error.response.status === 401)
    {
      forceLogout('Failed to load rule sets graph')
    }
    return [];
  }
}

/**
 * Loads connect data if required
 */
async function refreshConnectData(lastChange)
{
  try
  {

    if (isCacheValid('connectDataTimestamp', lastChange))
    {
      return;
    }

    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/connect`, options);

    var phoneNumbers = response.data.phoneNumbers;
    var contactFlows = response.data.contactFlows;
    var lambdaFunctions = response.data.lambdaFunctions;
    var timeZone = response.data.timeZone;
    var operatingHours = response.data.operatingHours;
    var localTime = response.data.localTime;
    var localDateTime = response.data.localDateTime;
    var contactFlows = response.data.contactFlows;
    var queues = response.data.queues;
    var prompts = response.data.prompts;
    var lexBots = response.data.lexBots;
    var routingProfiles = response.data.routingProfiles;

    storeObject('phoneNumbers', phoneNumbers);
    storeObject('contactFlows', contactFlows);
    storeObject('queues', queues);
    storeObject('prompts', prompts);
    storeObject('operatingHours', operatingHours);
    storeObject('lambdaFunctions', lambdaFunctions);
    storeObject('lexBots', lexBots);
    storeObject('routingProfiles', routingProfiles);

    store('connectDataTimestamp', lastChange);
  }
  catch (error)
  {
    logError('[ERROR] Failed to load connect data', error);
    errorToast('Failed to load connect data');

    if (error.response.status === 401)
    {
      forceLogout('Failed to load connect data')
    }
    return null;
  }
}

/**
 * Loads a rule set for editing todo this could use the cache
 */
async function getRuleSet(ruleSetId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/rulesets?ruleSetId=${ruleSetId}`, options);
    return response.data.ruleSets[0];
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule set', error);
    errorToast('Failed to load rule set');

    if (error.response.status === 401)
    {
      forceLogout('Failed to load rule set')
    }
    return null;
  }
}

/**
 * Loads a rule by id
 */
async function getRule(ruleSetId, ruleId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/rule?ruleSetId=${ruleSetId}&ruleId=${ruleId}`, options);

    var rule = response.data.rule;

    return rule;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load rule', error);
    errorToast('Failed to load rule');

    if (error.response.status === 401)
    {
      forceLogout('Failed to load rule')
    }
  }
}

/**
 * Loads a test by id
 */
async function getTest(testId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(siteConfig.api + '/tests?testId=' + testId, options);

    var test = response.data.tests[0];

    console.info('Loaded test: ' + JSON.stringify(test, null, 2));

    return test;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load test', error);
    errorToast('Failed to load test');

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to load test')
    }

    return undefined;
  }
}

/**
 * Loads a batch by id
 */
async function getBatch(batchId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(siteConfig.api + '/batches?batchId=' + batchId, options);

    var batch = response.data.batches[0];

    computeBatchPercentages(batch);

    return batch;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load batch', error);
    errorToast('Failed to load batch results');

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to load batch')
    }

    return undefined;
  }
}

function computeBatchPercentages(batch)
{
  if (batch !== undefined && batch.results !== undefined)
  {
    var errorCount = 0;
    var warningCount = 0;
    var successCount = 0;

    batch.results.forEach(test => {
      if (test.success !== true)
      {
        errorCount++;
      }
      else if (test.warning === true)
      {
        warningCount++;
      }
      else
      {
        successCount++;
      }
    });

    var total = errorCount + warningCount + successCount;

    batch.errorCount = errorCount;
    batch.errorPercent = Math.floor(errorCount / total * 100)
    batch.warningCount = warningCount;
    batch.warningPercent = Math.floor(warningCount / total * 100);
    batch.successCount = successCount;
    batch.successPercent = 100 - (batch.errorPercent + batch.warningPercent);
  }
}

/**
 * Loads a batches
 * TODO add filter support here
 */
async function getBatches(mineOnly, errorsOnly)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var url = `${siteConfig.api}/batches?mineOnly=${mineOnly}&errorsOnly=${errorsOnly}`;

    var response = await axios.get(url, options);

    return response.data.batches;
  }
  catch (error)
  {
    logError('[ERROR] Failed to load batches', error);
    errorToast('Failed to load batches');

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to load batches')
    }

    return undefined;
  }
}

/**
 * Creates a new end point
 */
async function createEndPoint(name, description, inboundNumbers, enabled)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your end point...')

    await axios.put(siteConfig.api + '/endpoint', {
      name: name,
      description: description,
      inboundNumbers: inboundNumbers,
      enabled: enabled
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create end point', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to create end point');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast('An end already exists with this name');
    }
    else
    {
      errorToast('Failed to create your end point');
    }

    return false;
  }
}

async function renderBatchResults(batchId, testId = undefined, failuresOnly = false)
{
  try
  {
    var batch = await getBatch(batchId);

    if (batch === undefined)
    {
      throw new Error('Invalid batch id');
    }

    // Filter the results to this one test id
    if (testId !== undefined && testId !== null)
    {
      batch.testIds = batch.testIds.filter(tId => tId === testId);

      if (batch.testIds.length !== 1)
      {
        window.location.hash = '#test';
        return;
      }

      batch.results = batch.results.filter(result => result.testId === testId);
      batch.testCount = 1;
      batch.success = batch.results[0].success;
      batch.warning = batch.results[0].warning === true;

      computeBatchPercentages(batch);
    }

    // Filter for just failures and warnings
    if (failuresOnly)
    {
      batch.results = batch.results.filter(result => result.success === false || result.warning == true);
      batch.testCount = batch.results.length;
      computeBatchPercentages(batch);
    }

    var html = batchResultSaveTemplate({
      siteConfig: siteConfig,
      batch: batch
    });

    return html;
  }
  catch (error)
  {
    console.error('[ERROR] Failed to render batch results', error);
    errorToast('Failed to render batch results');
    return undefined;
  }
}

async function startBatch(folder, recursive, testIds)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var body = {
      folder: folder,
      recursive: recursive,
      testIds: testIds // may be undefined
    };

    var response = await axios.post(`${siteConfig.api}/batchinferencestart`, body, options);

    var startBatchResponse = response.data;

    successToast(`Started batch: ${startBatchResponse.batchId} with: ${startBatchResponse.testIds.length} test(s)`);

    console.info(`Successfully started batch: ${JSON.stringify(startBatchResponse, null, 2)}`);
    return startBatchResponse;
  }
  catch (error)
  {
    logError('[ERROR] Failed to start batch test run', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to start batch test run');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);
    }
    else
    {
      errorToast('Failed to start batch test run');
    }
    return undefined;
  }
}

/**
 * Deletes an end point
 */
async function deleteEndPoint(endPointId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting end point...')
    await axios.delete(`${siteConfig.api}/endpoint?endPointId=${endPointId}`, options);
    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to delete end point', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to delete end point');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);
    }
    else
    {
      errorToast('Failed to delete end point');
    }
    return false;
  }
}

/**
 * Creates a new user
 */
async function createUser(firstName, lastName, emailAddress, userRole, apiKey, userEnabled)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your user...')

    await axios.put(siteConfig.api + '/user', {
      firstName: firstName,
      lastName: lastName,
      emailAddress: emailAddress,
      userRole: userRole,
      apiKey: apiKey,
      userEnabled: userEnabled
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create user', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to create user');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast('A user already exists with this email address');
    }
    else
    {
      errorToast('Failed to create your user');
    }

    return false;
  }
}

/**
 * Creates a new holiday
 */
async function createHoliday(when, name, description, closed)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your holiday...')

    await axios.put(siteConfig.api + '/holiday', {
      when: when,
      name: name,
      description: description,
      closed: closed
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create holiday', error);

    errorToast('Failed to create your holiday');

    if (error.response.status === 401)
    {
      forceLogout('Failed to create holiday')
    }

    return false;
  }
}

/**
 * Saves a holiday
 */
async function saveHoliday(holidayId, when, name, description, closed)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Saving your holiday...')

    await axios.post(siteConfig.api + '/holiday', {
      holidayId: holidayId,
      when: when,
      name: name,
      description: description,
      closed: closed
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to save holiday', error);

    errorToast('Failed to save your holiday');

    if (error.response.status === 401)
    {
      forceLogout('Failed to save holiday')
    }

    return false;
  }
}

/**
 * Get holidays
 */
async function getHolidays()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.get(`${siteConfig.api}/holidays`, options);

    var holidays = response.data.holidays;

    console.log('[INFO] got holidays: ' + JSON.stringify(holidays, null, 2));

    return holidays;
  }
  catch (error)
  {
    logError('[ERROR] Failed to fetch holidays', error);

    errorToast('Failed to fetch holidays');

    if (error.response.status === 401)
    {
      forceLogout('Failed to fetch holidays')
    }

    return false;
  }
}

/**
 * Refreshes the Connect config cache
 */
async function refreshConnectCache()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var body = {};

    stickySuccessToast('Refreshing Connect cache...')

    var response = await axios.post(`${siteConfig.api}/refreshconnectcache`, body, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to refresh Connect cache', error);

    errorToast('Failed to refresh Connect cache');

    if (error.response.status === 401)
    {
      forceLogout('Failed to refresh Connect cache')
    }
    return false;
  }
}

/**
 * Creates a new rule set
 */
async function createRuleSet(ruleSetName, ruleSetEnabled, ruleSetDescription, endPoints, folder)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your rule set...')

    var response = await axios.put(siteConfig.api + '/ruleset', {
      ruleSetName: ruleSetName,
      ruleSetEnabled: ruleSetEnabled,
      ruleSetDescription: ruleSetDescription,
      endPoints: endPoints,
      folder: folder
    }, options);

    return response.data.ruleSetId;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create rule set', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to create rule set');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast('A rule set with this name already exists, choose another name');
    }
    else
    {
      errorToast('Failed to create your rule set');
    }

    return undefined;
  }
}

/**
 * Creates a new rule
 */
async function createRule(ruleSetId, ruleName, ruleEnabled, ruleDescription,
  rulePriority, ruleActivation, ruleType, params, weights)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your rule...')

    var response = await axios.put(siteConfig.api + '/rule', {
      ruleSetId: ruleSetId,
      ruleName: ruleName,
      ruleEnabled: ruleEnabled,
      ruleDescription: ruleDescription,
      rulePriority: rulePriority,
      ruleActivation: ruleActivation,
      ruleType: ruleType,
      params: params,
      weights: weights
    }, options);

    return response.data.ruleId;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create rule', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to create rule');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast('A rule with this name already exists in this rule set, choose another name');
    }
    else if (error.response && error.response.status === 400)
    {
      errorToast('Invalid handlebars syntax, please message syntax.')
    }
    else
    {
      errorToast('Failed to create your rule');
    }

    return undefined;
  }
}

/**
 * Updates an existing rules set
 */
async function updateRuleSet(ruleSetId, ruleSetEnabled, ruleSetDescription, endPoints, folder)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Updating rule set...')

    await axios.post(siteConfig.api + '/ruleset', {
      ruleSetId: ruleSetId,
      ruleSetEnabled: ruleSetEnabled,
      ruleSetDescription: ruleSetDescription,
      endPoints: endPoints,
      folder: folder
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to update rule set', error);
    errorToast('Failed to update rule set');

    if (error.response.status === 401)
    {
      forceLogout('Failed to update rule set')
    }
    return false;
  }
}

/**
 * Updates an existing rule
 */
async function updateRule(ruleSetId, ruleId, ruleEnabled, ruleDescription,
  rulePriority, ruleActivation, ruleType, params)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Updating rule...')

    await axios.post(siteConfig.api + '/rule', {
      ruleSetId: ruleSetId,
      ruleId: ruleId,
      ruleEnabled: ruleEnabled,
      ruleDescription: ruleDescription,
      rulePriority: rulePriority,
      ruleActivation: ruleActivation,
      ruleType: ruleType,
      params: params
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to update rule', error);
    errorToast('Failed to update rule');

    if (error.response.status === 401)
    {
      forceLogout('Failed to update rule')
    }
    return false;
  }
}

/**
 * Updates an existing test
 */
async function updateTest(testId, name, productionReady, folder, testReference,
  description, endPointName, testDateTime,
  customerPhoneNumber, payload, contactAttributes)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Updating test...');

    var body = {
      testId: testId,
      name: name,
      productionReady: productionReady,
      folder: folder,
      testReference: testReference,
      description: description,
      endPoint: endPointName,
      testDateTime: moment(testDateTime).utc().format(),
      customerPhoneNumber: customerPhoneNumber,
      payload: payload,
      contactAttributes: contactAttributes
    };

    console.info('Updating test with: ' + JSON.stringify(body, null, 2));

    await axios.post(siteConfig.api + '/test', body, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to update test', error);

    await sleep(1000);

    clearAllToasts();

    if (error.response)
    {
      if (error.response.status === 401)
      {
        forceLogout('Failed to update test');
      }
      else
      {
        errorToast('Failed to update your test: ' + error.message);
      }
    }
    else
    {
      errorToast('Failed to update your test: ' + error.message);
    }

    return false;
  }
}

/**
 * Creates a new test
 */
async function createTest(name, productionReady, folder, testReference,
  description, endPointName, testDateTime,
  customerPhoneNumber, payload, contactAttributes)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating your test...');

    var body = {
      name: name,
      productionReady: productionReady,
      folder: folder,
      testReference: testReference,
      description: description,
      endPoint: endPointName,
      testDateTime: moment(testDateTime).utc().format(),
      customerPhoneNumber: customerPhoneNumber,
      payload: payload,
      contactAttributes: contactAttributes
    };

    console.info('Creating test with: ' + JSON.stringify(body, null, 2));

    await axios.put(siteConfig.api + '/test', body, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create test', error);

    await sleep(1000);

    clearAllToasts();

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to create test');
    }
    else
    {
      errorToast('Failed to create your test: ' + error.message);
    }

    return false;
  }
}

/**
 * Creates a new weight
 */
async function createWeight(ruleSetId, ruleId, field, operation, value, weight)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Creating weight...')

    await axios.put(siteConfig.api + '/weight', {
      ruleSetId: ruleSetId,
      ruleId: ruleId,
      field: field,
      operation: operation,
      value: value,
      weight: weight
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create weight', error);
    errorToast('Failed to create your weight');

    if (error.response.status === 401)
    {
      forceLogout('Failed to create weight')
    }
    return false;
  }
}

/**
* Update existing weight
*/
async function updateWeight(weightId,ruleSetId, ruleId, field, operation, value, weight)
{
  try
  {
    var options =
    {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('updating weight...')

    await axios.put(siteConfig.api + '/updateweight',
    {
      weightId: weightId,
      ruleSetId: ruleSetId,
      ruleId: ruleId,
      field: field,
      operation: operation,
      value: value,
      weight: weight
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create weight', error);
    errorToast('Failed to create your weight');

    if (error.response.status === 401)
    {
      forceLogout('Failed to create weight')
    }

    return false;
  }
}

/**
 * Delete a weight
 */
async function deleteWeight(ruleSetId, ruleId, weightId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting weight...')

    await axios.delete(`${siteConfig.api}/weight?ruleSetId=${ruleSetId}&ruleId=${ruleId}&weightId=${weightId}`, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to delete weight', error);
    errorToast('Failed to delete weight');

    if (error.response.status === 401)
    {
      forceLogout('Failed to delete weight')
    }
    return false;
  }
}

/**
 * Updates an existing user
 */
async function updateUser(userId, firstName, lastName,
  emailAddress, userRole, apiKey, userEnabled)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Updating user...')

    await axios.post(siteConfig.api + '/user', {
      userId: userId,
      firstName: firstName,
      lastName: lastName,
      emailAddress: emailAddress,
      userRole: userRole,
      apiKey: apiKey,
      userEnabled: userEnabled
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to update user', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to update user');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);
    }
    else
    {
      errorToast('Failed to update user');
    }

    return false;
  }
}

/**
 * Updates an existing end point
 */
async function updateEndPoint(endPointId, description, inboundNumbers, enabled)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Updating end point...')

    await axios.post(siteConfig.api + '/endpoint', {
      endPointId: endPointId,
      description: description,
      inboundNumbers: inboundNumbers,
      enabled: enabled
    }, options);

    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to update end point', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to update end point')
    }

    errorToast('Failed to update end point');

    return false;
  }
}

/**
 * Deletes a rule set
 */
async function deleteRuleSet(ruleSetId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting rule set...');
    await axios.delete(`${siteConfig.api}/ruleset?ruleSetId=${ruleSetId}`, options);
    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to delete rule set', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to delete your rule set');
    }
    else  if (error.response && error.response.status === 409)
    {
      errorToast('Cannot delete a rule set that is in use: ' + error.response.data.data.message);
    }
    else
    {
      errorToast('Failed to delete your rule set');
    }

    return false;
  }
}

/**
 * Clones a rule set and it's rules to a new name
 */
async function cloneRuleSet(ruleSetId, newName)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Cloning rule set...');

    var body = {
      ruleSetId: ruleSetId,
      ruleSetName: newName
    };

    var response = await axios.post(`${siteConfig.api}/rulesetclone`, body, options);

    return response.data.ruleSetId;
  }
  catch (error)
  {
    logError('[ERROR] Failed to clone rule set', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to clone rule set')
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);
    }
    else
    {
      errorToast('Failed to clone your rule set');
    }

    return undefined;
  }
}

/**
 * Clones a rule with new name
 */
 async function cloneRule(ruleSetId, ruleId, newName)
 {
    try
    {
      var options = {
        headers: {
           'x-api-key': unstore('api-key')
        }
      };

      stickySuccessToast('Cloning rule');

      var body = {
        ruleSetId: ruleSetId,
        ruleId: ruleId,
        ruleName: newName
      };

      var response = await axios.put(`${siteConfig.api}/clonerule`, body, options);

      return response.data.ruleId;
    }
    catch (error)
    {
      logError('[ERROR] Failed to clone rule', error);

      if (error.response && error.response.status === 401)
      {
        forceLogout('Failed to clone your rule');
      }
      else if (error.response && error.response.status === 409)
      {
        errorToast(error.response.data.data.message);
      }
      else
      {
        errorToast('Failed to clone your rule');
      }

      return undefined;
    }
 }

/**
 * Renames a rule to a new name
 */
async function renameRule(ruleSetId, ruleId, newName)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Renaming rule...');

    var body = {
      ruleSetId: ruleSetId,
      ruleId: ruleId,
      ruleName: newName
    };

    await axios.post(`${siteConfig.api}/rulename`, body, options);
    return true;
  }
  catch (error)
  {

    logError('[ERROR] Failed to rename rule', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to rename rule');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);
    }
    else
    {
      errorToast('Failed to rename your rule');
    }

    return false;
  }
}

/**
 * Renames a rule set to a new name
 */
async function renameRuleSet(ruleSetId, newName)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Renaming rule set...');

    var body = {
      ruleSetId: ruleSetId,
      ruleSetName: newName
    };

    await axios.post(`${siteConfig.api}/rulesetname`, body, options);
    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to rename rule set', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to rename rule set');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);
    }
    else
    {
      errorToast('Failed to rename your rule set');
    }

    return false;
  }
}

/**
 * Moves rule sets
 */
async function moveRuleSets(ruleSetIds, newFolder)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Moving rule sets...');

    var body = {
      ruleSetIds: ruleSetIds,
      newFolder: newFolder
    };

    await axios.post(`${siteConfig.api}/rulesetfolder`, body, options);
    return true;
  }
  catch (error)
  {

    logError('[ERROR] Failed to move rule sets', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to move rule set');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);
    }
    else
    {
      errorToast('Failed to move your rule set');
    }

    return false;
  }
}

/**
 * Moves tests
 */
async function moveTests(testIds, newFolder)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Moving tests...');

    var body = {
      testIds: testIds,
      newFolder: newFolder
    };

    await axios.post(`${siteConfig.api}/testfolder`, body, options);
    return true;
  }
  catch (error)
  {

    logError('[ERROR] Failed to move tests', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to move tests');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);
    }
    else
    {
      errorToast('Failed to move tests');
    }

    return false;
  }
}


/**
 * Copy tests
 */
async function copyTests(testIds, copyFolder)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Copying tests...');

    var body = {
      testIds: testIds,
      copyFolder: copyFolder
    };

    await axios.post(`${siteConfig.api}/copytests`, body, options);
    return true;
  }
  catch (error)
  {

    logError('[ERROR] Failed to copy tests', error);

    if (error.response && error.response.status === 401)
    {
      forceLogout('Failed to copy tests');
    }
    else if (error.response && error.response.status === 409)
    {
      errorToast(error.response.data.data.message);
    }
    else
    {
      errorToast('Failed to copy tests');
    }

    return false;
  }
}

/**
 * Deletes a rule
 */
async function deleteRule(ruleSetId, ruleId)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Deleting rule...');
    await axios.delete(`${siteConfig.api}/rule?ruleSetId=${ruleSetId}&ruleId=${ruleId}`, options);
    return true;
  }
  catch (error)
  {
    logError('[ERROR] Failed to delete a rule', error);
    errorToast('Failed to delete rule');

    if (error.response.status === 401)
    {
      forceLogout('Failed to delete a rule')
    }
    return false;
  }
}


async function deleteObject(type, id)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast(`Deleting ${type}...`);
    await axios.delete(`${siteConfig.api}/object?type=${type}&id=${id}`, options);
    return true;
  }
  catch (error)
  {
    logError(`[ERROR] Failed to delete ${type}`, error);
    errorToast(`Failed to delete ${type}`);

    if (error.response.status === 401)
    {
      forceLogout(`Failed to delete ${type}`)
    }
    return false;
  }
}

/**
 * Fetches system health
 */
async function getSystemHealth()
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    stickySuccessToast('Loading system health...');
    var response = await axios.get(siteConfig.api + '/systemhealth', options);
    return response.data.systemHealth;

  }
  catch (error)
  {
    logError('[ERROR] Failed to determine system health', error);
    errorToast('Failed to determine system health');

    if (error.response.status === 401)
    {
      forceLogout('Failed to determine system health')
    }
    throw error;
  }
}

/**
 * List lex bots
 */
async function describeLexBot(botName)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var body = {
      botName: botName    };

    var response = await axios.post(siteConfig.api + '/lexbot', body, options);
    return response.data.lexBot;
  }
  catch (error)
  {
    logError('[ERROR] Failed to describe lex bot', error);
    errorToast('Failed to describe lex bot');

    if (error.response.status === 401)
    {
      forceLogout('Failed to describe lex bot')
    }
    throw error;
  }
}

/**
 * Attempts to create a contact flow
 */
async function createContactFlow(contactFlow)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.post(siteConfig.api + '/createcontactflow', {
      contactFlow: contactFlow
    }, options);
    return response.data;
  }
  catch (error)
  {
    logError('[ERROR] Failed to create contact flow', error);
    errorToast('Failed to create contact flow: ' + contactFlow.name);
    if (error.response.status === 401)
    {
      forceLogout('Failed to create contact flow')
    }
    throw error;
  }
}


/**
 * Attempts to update the content of a contact flow
 */
async function updateContactFlow(contactFlow)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.post(siteConfig.api + '/updatecontactflow', {
      contactFlow: contactFlow
    }, options);
    return response.data.status;
  }
  catch (error)
  {
    logError('[ERROR] Failed to update contact flow', error);
    errorToast('Failed to update contact flow: ' + contactFlow.name);

    if (error.response.status === 401)
    {
      forceLogout('Failed to update contact flow')
    }
    throw error;
  }
}

/**
 * Inferences the rules engine
 */
async function inference(message)
{
  try
  {
    var options = {
      headers: {
        'x-api-key': unstore('api-key')
      }
    };

    var response = await axios.post(siteConfig.api + '/inference', { message: message }, options);
    var inferenceResults = response.data;
    return inferenceResults.inference;
  }
  catch (error)
  {
    logError('[ERROR] Failed to inference rules', error);
    errorToast('Failed to inference');

    if (error.response.status === 401)
    {
      forceLogout('Failed to inference rules')
    }
    throw error;
  }
}

/**
 * Add a tree node if it doesn't exist, returning
 * this node's children or the new node's children
 */
function addChildIfNotExists(id, text, children)
{
  var existing = children.find(child => child.id === id);

  if (existing === undefined)
  {
    var node = {
      id: id,
      text: text,
      children: []
    };

    children.push(node);

    return node.children;
  }
  else
  {
    return existing.children;
  }
}

/**
 * Build a tree model of all available rule set folders
 */
function buildRuleSetTree(ruleSets)
{
  var treeModel = [];
  var root = {
    text: 'Rule sets',
    id: '/',
    state: {
      opened: true
    },
    children: []
  };

  var allFolders = [];

  ruleSets.forEach(ruleSet => {
    allFolders.push(ruleSet.folder);
  });

  allFolders.sort();

  allFolders.forEach(folder =>
  {
    var paths = folder.split('/');
    paths.shift();

    currentPath = '';

    var children = root.children;

    paths.forEach(path => {
      if (path !== '')
      {
        currentPath += '/' + path;
        children = addChildIfNotExists(currentPath, path, children);
      }
    });
  });

  treeModel.push(root);

  return treeModel;
}

/**
 * Build a tree model of all available test folders
 */
function buildTestsTree(tests)
{
  var treeModel = [];
  var root = {
    text: 'Tests',
    id: '/',
    state: {
      opened: true
    },
    children: []
  };

  var allFolders = [];

  tests.forEach(test => {
    allFolders.push(test.folder);
  });

  allFolders.sort();

  allFolders.forEach(folder =>
  {
    var paths = folder.split('/');
    paths.shift();

    currentPath = '';

    var children = root.children;

    paths.forEach(path => {
      if (path !== '')
      {
        currentPath += '/' + path;
        children = addChildIfNotExists(currentPath, path, children);
      }
    });
  });

  treeModel.push(root);

  return treeModel;
}

/**
 * Formats a tooltip
 */
function formatTooltip(type, data, maxLength)
{
  if (type === 'display')
  {
    if (data.length > maxLength)
    {
      return sprintf('<div data-toggle="tooltip" title="%s">%s…</span>',
        data, data.substr(0, maxLength));
    }
    else
    {
      return data;
    }
  }
  else
  {
    return data;
  }
}

/**
 * Renders a check icon if the value is true
 */
function renderCheck(type, data, maxLength)
{
  if (type === 'display')
  {
    if (data === 'true')
    {
      return '<i class="fas fa-check text-success" title="Enabled" data-toggle="tooltip"></i>';
    }
    else
    {
      return '<i class="fas fa-times text-muted" title="Disabled" data-toggle="tooltip"></i>';
    }
  }
  else
  {
    return '';
  }
}

/**
 * Validates a folder path
 */
function validateFolder(folder)
{
  if (folder === undefined || folder === null || folder.trim() === '')
  {
    alert('Folder cannot be empty');
    return false;
  }

  if (!folder.startsWith('/'))
  {
    alert('Folders must start with /');
    return false;
  }

  if (folder !== '/' && folder.endsWith('/'))
  {
    alert('Folders must not end with /');
    return false;
  }

  if (folder.includes('//'))
  {
    alert('Folders must not contain empty path elements: //');
    return false;
  }

  if (folder.includes('..'))
  {
    alert('Folders must not contain dots: ..');
    return false;
  }

  if (folder.includes('&'))
  {
    alert('Folders must not contain &');
    return false;
  }

  if (folder.includes('#'))
  {
    alert('Folders must not contain #');
    return false;
  }

  if (folder.includes('  '))
  {
    alert('Folders must not contain multiple spaces');
    return false;
  }

  return true;
}

/**
 * Inserts a test line into a test editor
 */
async function insertTestLine(textAreaId, testLineId)
{
  var testLine = $('#' + testLineId).val().trim();

  if (testLine === '')
  {
    return;
  }

  var toInsert = '';

  switch (testLine)
  {
    case 'attribute':
    {
      toInsert = '# Remove ^$ to perform fuzzy matching.\n# Leave value blank to assert an attribute is not present.\nattribute: { "key": "Key", "value": "^Your value$" }';
      break;
    }
    case 'comment':
    {
      toInsert = '# Your comment text';
      break;
    }
    case 'input':
    {
      toInsert = 'input: "Your value"';
      break;
    }
    case 'message':
    {
      toInsert = '# Remove ^$ to perform fuzzy matching.\nmessage: "^Your message$"';
      break;
    }
    case 'queue':
    {
      toInsert = '# Remove ^$ to perform fuzzy matching.\nqueue: "^Queue name$"';
      break;
    }
    case 'state':
    {
      toInsert = '# Remove ^$ to perform fuzzy matching.\n# Leave value blank to assert a state item is not present.\nstate: { "key": "Key", "value": "^Your value$" }';
      break;
    }
    case 'terminate':
    {
      toInsert = 'terminate: ""';
      break;
    }
  }

  // Look for an existing cursor position
  var textArea = document.getElementById(textAreaId);

  var startPosition = textArea.selectionStart;
  var endPosition = textArea.selectionEnd;

  var existingScript = $('#' + textAreaId).val();

  var prefix = existingScript.substring(0, startPosition);
  var suffix = existingScript.substring(endPosition);

  console.info(`Got start: ${startPosition} end: ${endPosition}`);

  if (prefix !== '' && !prefix.endsWith('\n'))
  {
    prefix += '\n';
  }

  var newScript = prefix + toInsert + '\n';

  $('#' + textAreaId).val(newScript + suffix);
  $('#' + textAreaId).focus();
  $('#' + textAreaId).prop('selectionEnd', newScript.length);
}

/**
 * Fetches the list of valid action names
 */
function getValidActionNames()
{
  return [
    'Distribution',
    'DTMFMenu',
    'DTMFInput',
    'DTMFSelector',
    'ExternalNumber',
    'Integration',
    'Message',
    'Metric',
    'NLUMenu',
    'Queue',
    'RuleSet',
    'RuleSetBail',
    'RuleSetPrompt',
    'SetAttributes',
    'SMSMessage',
    'Terminate',
    'UpdateStates'
  ];
}

