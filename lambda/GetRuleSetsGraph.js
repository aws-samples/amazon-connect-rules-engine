
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');

/**
 * Fetches a rule set graph
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR', 'POWER_USER', 'TESTER']);

    var ruleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

    var nodes = [];
    var edges = [];

    // Create the graph
    computeGraph(ruleSets, nodes, edges);

    return requestUtils.buildSuccessfulResponse({
      nodes: nodes,
      edges: edges
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to load rule set graph', error);
    return requestUtils.buildErrorResponse(error);
  }
};

/**
 * Computes the top level graph for all rule sets
 */
function computeGraph(ruleSets, nodes, edges)
{
  var endPointColour  = '#4ea435';
  var outboundColour = '#f89800';

  var ruleSetIdMap = new Map();
  var externalNumberIdMap = new Map();
  var uniqueEdgesSet = new Set();
  var id = 0;

  // Add a node for each rule set
  ruleSets.forEach(rs => {
    var ruleSetId = id++;

    ruleSetIdMap.set(rs.name, ruleSetId);

    // Add a node for each rule set
    nodes.push({
      id: ruleSetId,
      folder: rs.folder,
      ruleSetId: rs.ruleSetId,
      label: rs.name.replace(' - ', '\n'),
      title: rs.description,
      type: 'ruleSet',
      shape: 'image',
      image: 'img/icons/ruleset.png'
    });

    // Iterate all end points
    rs.endPoints.forEach(endPoint => {

      var endPointId = id++;

      // Add a node for each end point
      nodes.push({
        id: endPointId,
        label: endPoint,
        title: 'End point: ' + endPoint,
        shape: 'image',
        type: 'endPoint',
        image: 'img/icons/customer.png'
      });

      addEdge(uniqueEdgesSet, edges, endPointId, ruleSetId, endPointColour , endPointColour );
    });
  });

  // Iterate each rule set creating forward links
  // and potentially assets for linked objects
  ruleSets.forEach(rs => {

    var sourceId = ruleSetIdMap.get(rs.name);

    rs.rules.forEach(rule => {

      if (rule.type === 'Distribution')
      {
        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.match(/ruleSetName[0-9]+/))
          {
            var linkedRuleSetName = rule.params[key];
            var percentage = rule.params['percentage' + key.substring(11)];
            var targetId = ruleSetIdMap.get(linkedRuleSetName);
            addEdge(uniqueEdgesSet, edges, sourceId, targetId, null, null, percentage);
          }
        });

        var defaultRuleSetName = rule.params.defaultRuleSetName;
        var defaultTargetId = ruleSetIdMap.get(defaultRuleSetName);
        addEdge(uniqueEdgesSet, edges, sourceId, defaultTargetId, null, null, 'Default');
      }

      if (rule.type === 'DTMFMenu')
      {
        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.match(/dtmf[0-9]+/))
          {
            var linkedRuleSetName = rule.params[key];
            var targetId = ruleSetIdMap.get(linkedRuleSetName);

            var label = key.substring(4);

            addEdge(uniqueEdgesSet, edges, sourceId, targetId, null, null, label);
          }
        })
      }

      if (rule.type === 'NLUMenu')
      {
        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.startsWith('intentRuleSet_'))
          {
            var linkedRuleSetName = rule.params[key];
            var targetId = ruleSetIdMap.get(linkedRuleSetName);

            addEdge(uniqueEdgesSet, edges, sourceId, targetId, null, null);
          }
        })
      }

      if (rule.type === 'RuleSet')
      {
        var targetId = ruleSetIdMap.get(rule.params.ruleSetName);
        addEdge(uniqueEdgesSet, edges, sourceId, targetId, null, null);

        // Add the return path as well if we have a return here flag set
        if (rule.params.returnHere === 'true')
        {
          addEdge(uniqueEdgesSet, edges, targetId, sourceId, null, null);
        }
      }

      if (rule.type === 'RuleSetBail')
      {
        var targetId = ruleSetIdMap.get(rule.params.ruleSetName);
        addEdge(uniqueEdgesSet, edges, sourceId, targetId, null, null);
      }

      if (rule.type === 'RuleSetPrompt')
      {
        var targetId = ruleSetIdMap.get(rule.params.ruleSetName);
        addEdge(uniqueEdgesSet, edges, sourceId, targetId, null, null);
      }

      if (rule.type === 'Queue')
      {
        var queueId = id++;

        nodes.push({
          id: queueId,
          label: rule.params.queueName,
          title: 'Queue: ' + rule.params.queueName,
          shape: 'image',
          type: 'queue',
          image: 'img/icons/agent.png'
        });

        addEdge(uniqueEdgesSet, edges, sourceId, queueId, outboundColour, outboundColour);
      }

      if (rule.type === 'Terminate')
      {
        var terminateId = id++;

        nodes.push({
          id: terminateId,
          label: 'Terminate',
          title: 'Terminate',
          shape: 'image',
          type: 'terminate',
          image: 'img/icons/terminate.png'
        });

        addEdge(uniqueEdgesSet, edges, sourceId, terminateId, outboundColour, outboundColour);
      }

      if (rule.type === 'ExternalNumber')
      {
        var externalNumberId = externalNumberIdMap.get(rule.params.externalNumber);

        if (externalNumberId === undefined)
        {
          externalNumberId = id++;
          externalNumberIdMap.set(rule.params.externalNumber, externalNumberId);

          nodes.push({
            id: externalNumberId,
            label: rule.params.externalNumber,
            title: 'External number: ' + rule.params.externalNumber,
            shape: 'image',
            type: 'outbound',
            image: 'img/icons/phone.png'
          });
        }

        addEdge(uniqueEdgesSet, edges, sourceId, externalNumberId, outboundColour, outboundColour);
      }
    });
  });
}

/**
 * Add an edge, checking for an existing edge to reverse
 */
function addEdge(uniqueEdgesSet, edges, id1, id2, colour1, colour2, label = null)
{
  if (uniqueEdgesSet.has(`${id1}_${id2}`))
  {
    return;
  }

  if (uniqueEdgesSet.has(`${id2}_${id1}`))
  {
    var edge = edges.find(edge => edge.from === id2 && edge.to === id1);

    if (edge !== undefined)
    {
      // Add the return arrow
      edge.arrows.from =
      {
        enabled: true,
        type: 'arrow'
      };

      if (label !== null)
      {
        if (edge.label !== undefined)
        {
          edge.label += ',' + label;
        }
        else
        {
          edge.label = label;
        }
      }
    }
  }
  else
  {
    var edge = {
      from: id1,
      to: id2,
      font: {
        align: 'top',
        color: '#418aeb'
      },
      arrows:
      {
        to:
        {
          enabled: true,
          type: 'arrow'
        }
      }
    };

    if (colour1 && colour2)
    {
      edge.color = {
        color: colour1,
        highlight: colour2
      };
    }

    if (label != null)
    {
      edge.label = label;
    }

    edges.push(edge);
  }

  uniqueEdgesSet.add(`${id1}_${id2}`);
}
