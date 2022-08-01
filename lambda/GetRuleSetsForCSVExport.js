var papa = require('papaparse');
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches all rule sets and rules for export
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER']);

    var ruleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    // Remove the rule set ids, rule ids and weight ids from the response
    ruleSets.forEach(ruleSet => {

      ruleSet.ruleSetId = undefined;

      ruleSet.rules.forEach(rule => {
        rule.ruleId = undefined;
        rule.ruleSetId = undefined;

        rule.weights.forEach(weight => {
          weight.weightId = undefined;
        });
      });
    });

    var csvData = convertJSONToCSV(ruleSets)

    return requestUtils.buildSuccessfulResponse({
      csvData
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule sets for export', error);
    return requestUtils.buildErrorResponse(error);
  }
};

var convertJSONToCSV = (ruleSets) => {
  var csvData = [];

  ruleSets.forEach(ruleSet => {
    ruleSet.rules.forEach(rule => {

      csvData.push({
        RuleSet: ruleSet.name,
        Rule: rule.name,
        RuleType: rule.type,
        Folder: ruleSet.folder,
        IsMessage: 'false',
        IsPrompt: 'false',
        IsDynamic: 'false',
        Name: 'ruleDescription',
        Value: rule.description
      });

      var keys = Object.keys(rule.params);
      keys.forEach(key =>
      {
        var isMessage = '' + key.toLowerCase().includes('message');

        var value = ('' + rule.params[key]).trim();
        value = value.replace(/(\r\n)+|\n+/g, ' ');

        var isPrompt = 'false';

        if (isMessage && value.startsWith('prompt:'))
        {
          isPrompt = 'true';
        }

        csvData.push({
          RuleSet: ruleSet.name,
          Rule: rule.name,
          RuleType: rule.type,
          Folder: ruleSet.folder,
          IsMessage: isMessage,
          IsPrompt: isPrompt,
          IsDynamic: '' + value.includes('{{'),
          Name: key,
          Value: value
        });
      });

    });
  });
  var output = papa.unparse(csvData, {
    quotes: true,
    quoteChar: '"',
    escapeChar: '"',
    delimiter: ",",
    header: true,
  })
  return output
}
