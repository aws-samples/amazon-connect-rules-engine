// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var AWS = require('aws-sdk');
var dynamo = new AWS.DynamoDB();
var moment = require('moment-timezone');
var s3Utils = require('./S3Utils');

const unmarshall = AWS.DynamoDB.Converter.unmarshall

const { v4: uuidv4 } = require('uuid');

const {gzip, ungzip} = require('node-gzip');

/**
 * Here because aws-sdk-mock requires an instance declared within a test
 * This overrides this file with the mocked dynamo db source to allow unit testing
 * The alternative to this is to have each function create its own new instance of
 * dynamoDB which contradicts lambda best practices
 * Read more on aws-sdk-mock github.
 */
module.exports.setDynamoDB = function(ddb) {
  dynamo = ddb;
}

/**
 * Loads all users from DynamoDB
 */
module.exports.getUsers = async (usersTable) => {
  try {
    var statement = `SELECT * FROM "${usersTable}"`;

    var request = {
      Statement: statement,
      ConsistentRead: true
    };

    var results = await dynamo.executeStatement(request).promise();

    var users = [];

    results.Items.forEach(item => {
      users.push(makeUser(item));
    });

    /**
     * Keep scanning while we have more results
     */
    while (results.NextToken !== undefined) {
      request.NextToken = results.NextToken;
      results = await dynamo.executeStatement(request).promise();
      results.Items.forEach(item => {
        users.push(makeUser(item));
      });
    }

    return users;
  }
  catch (error) {
    console.log('[ERROR] failed to load users from Dynamo', error);
    throw error;
  }
};

/**
 * Loads all end points from DynamoDB
 */
module.exports.getEndPoints = async (endPointsTable) => {
  try {
    var statement = `SELECT * FROM "${endPointsTable}"`;

    var request = {
      Statement: statement,
      ConsistentRead: true
    };

    var results = await dynamo.executeStatement(request).promise();

    var endPoints = [];

    results.Items.forEach(item => {
      endPoints.push(makeEndPoint(item));
    });

    /**
     * Keep scanning while we have more results
     */
    while (results.NextToken !== undefined) {
      request.NextToken = results.NextToken;
      results = await dynamo.executeStatement(request).promise();
      results.Items.forEach(item => {
        endPoints.push(makeEndPoint(item));
      });
    }

    return endPoints;
  }
  catch (error) {
    console.log('[ERROR] failed to load end points from Dynamo', error);
    throw error;
  }
};

/**
 * Loads all rules from DynamoDB
 */
module.exports.getAllRules = async (rulesTable) => {
  try {
    var statement = `SELECT * FROM "${rulesTable}"`;

    var request = {
      Statement: statement,
      ConsistentRead: true
    };

    var rules = [];

    var results = await dynamo.executeStatement(request).promise();

    results.Items.forEach(item => {
      rules.push(makeRule(item));
    });

    /**
     * Keep scanning while we have more results
     */
    while (results.NextToken !== undefined) {
      request.NextToken = results.NextToken;

      results = await dynamo.executeStatement(request).promise();

      results.Items.forEach(item => {
        rules.push(makeRule(item));
      });
    }

    rules.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    return rules;
  }
  catch (error) {
    console.log('[ERROR] failed to load rules from Dynamo', error);
    throw error;
  }
};

/**
 * Loads all rule sets from DynamoDB
 */
module.exports.getAllRuleSets = async (ruleSetsTable) => {
  try {
    var statement = `SELECT * FROM "${ruleSetsTable}"`;

    var request = {
      Statement: statement,
      ConsistentRead: true
    };

    var ruleSets = [];

    var results = await dynamo.executeStatement(request).promise();

    results.Items.forEach(item => {
      ruleSets.push(makeRuleSet(item));
    });

    /**
     * Keep scanning while we have more results
     */
    while (results.NextToken !== undefined) {
      request.NextToken = results.NextToken;

      results = await dynamo.executeStatement(request).promise();

      results.Items.forEach(item => {
        ruleSets.push(makeRuleSet(item));
      });
    }

    ruleSets.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    return ruleSets;
  }
  catch (error) {
    console.log('[ERROR] failed to load rule sets from Dynamo', error);
    throw error;
  }
};

/**
 * Loads all rule sets from DynamoDB and their associated rules using two scans
 * instead of a scan with multipe queries
 */
module.exports.getRuleSetsAndRules = async (ruleSetsTable, rulesTable) => {
  try {
    var ruleSets = await module.exports.getAllRuleSets(ruleSetsTable);

    var ruleSetsMap = new Map();

    ruleSets.forEach(ruleSet => {
      ruleSet.rules = [];
      ruleSetsMap.set(ruleSet.ruleSetId, ruleSet);
    });

    var rules = await module.exports.getAllRules(rulesTable);

    rules.forEach(rule => {
      var ruleSet = ruleSetsMap.get(rule.ruleSetId);

      if (ruleSet !== undefined) {
        ruleSet.rules.push(rule);
      }
      else {
        throw new Error('Found rule with no matching rule set: ' + JSON.stringify(rule, null, 2));
      }

      ruleSetsMap.set(ruleSet.ruleSetId, ruleSet);
    });

    ruleSets.forEach(ruleSet => {
      ruleSet.rules.sort(function (a, b) {
        return b.priority - a.priority;
      });
    });

    return ruleSets;
  }
  catch (error) {
    console.log('[ERROR] failed to load rule sets and rules from Dynamo', error);
    throw error;
  }
};

/**
 * Loads all tests from DynamoDB
 */
module.exports.getTests = async (testsTable) => {
  try {
    var statement = `SELECT * FROM "${testsTable}"`;

    var request = {
      Statement: statement,
      ConsistentRead: true
    };

    var results = await dynamo.executeStatement(request).promise();

    var tests = [];

    if (results.Items) {
      results.Items.forEach(item => {
        tests.push(makeTest(item));
      });
    }

    /**
     * Keep scanning while we have more results
     */
    while (results.NextToken !== undefined)
    {
      console.info('Found additional test items to load');

      request.NextToken = results.NextToken;

      results = await dynamo.executeStatement(request).promise();

      results.Items.forEach(item => {
        tests.push(makeTest(item));
      });
    }

    tests.sort(function (a, b) {
      var c = a.folder.localeCompare(b.folder);

      if (c === 0)
      {
        return a.name.localeCompare(b.name);
      }

      return c;
    });

    return tests;
  }
  catch (error) {
    console.log('[ERROR] failed to load rules from Dynamo', error);
    throw error;
  }
};

/**
 * Fetches a rule set and contained rules from DynamoDB by rule set name
 */
module.exports.getRuleSetByName = async (ruleSetsTable, rulesTable, ruleSetName) => {
  try {
    var statement = `SELECT * FROM "${ruleSetsTable}" WHERE "Name" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: ruleSetName
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1) {
      var item = results.Items[0];
      var ruleSet = makeRuleSet(item);
      ruleSet.rules = await module.exports.getRules(rulesTable, ruleSet.ruleSetId);
      return ruleSet;
    }
    else {
      throw new Error('Failed to find rule set by name: ' + ruleSetName);
    }
  }
  catch (error) {
    console.log('[ERROR] failed to load rule set from Dynamo by name', error);
    throw error;
  }
};

/**
 * Fetches a rule set and contained rules from DynamoDB by ruleSetId
 */
module.exports.getRuleSet = async (ruleSetsTable, rulesTable, ruleSetId) => {
  try {
    var statement = `SELECT * FROM "${ruleSetsTable}" WHERE "RuleSetId" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: ruleSetId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1) {
      var item = results.Items[0];
      var ruleSet = makeRuleSet(item);
      ruleSet.rules = await module.exports.getRules(rulesTable, ruleSetId);
      return ruleSet;
    }
    else {
      throw new Error('Failed to find rule set for id: ' + ruleSetId);
    }
  }
  catch (error) {
    console.log('[ERROR] failed to load rule set from Dynamo', error);
    throw error;
  }
};

/**
 * Fetches the rules for a rule set sorted by descending priority
 */
module.exports.getRules = async (rulesTable, ruleSetId) => {
  try {
    var statement = `SELECT * FROM "${rulesTable}" WHERE "RuleSetId" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: ruleSetId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    var rules = [];

    results.Items.forEach(item => {
      rules.push(makeRule(item));
    });

    rules.sort(function (a, b) {
      return b.priority - a.priority;
    });

    return rules;
  }
  catch (error) {
    console.log('[ERROR] failed to load rules from Dynamo for rule set: ' + ruleSetId, error);
    throw error;
  }
};

/**
 * Fetches a rule from DynamoDB by rule set id and rule id
 */
module.exports.getRule = async (rulesTable, ruleSetId, ruleId) => {
  try {
    var statement = `SELECT * FROM "${rulesTable}" WHERE "RuleSetId" = ? AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1) {
      var item = results.Items[0];
      return makeRule(item);
    }
    else {
      throw new Error(`Failed to find rule for rule set id: ${ruleSetId} and rule id: ${ruleId}`);
    }
  }
  catch (error) {
    console.log('[ERROR] failed to load rule from Dynamo', error);
    throw error;
  }
};

/**
 * Persists customer state for updated state attributes, computes a batch up updates
 * and deletes and fires them at Dynamo
 */
module.exports.persistCustomerState = async function (stateTable, contactId, customerState, stateToSave) {
  try {
    // 4 hours
    var expiry = Math.floor(new Date().getTime() / 1000) + 4 * 60 * 60;

    var batchItems = [];

    for (var i = 0; i < stateToSave.length; i++) {
      var key = stateToSave[i];
      var value = customerState[key];

      if (value === undefined || value === null || value === '') {
        batchItems.push({
          DeleteRequest: {
            Key: {
              ContactId: {
                S: contactId
              },
              What: {
                S: key
              }
            }
          }
        });
      }
      else {
        var actualValue = value;

        // Handle object serialisation by converting them to JSON
        if (typeof actualValue === 'object') {
          actualValue = JSON.stringify(actualValue);
        }

        batchItems.push({
          PutRequest: {
            Item: {
              ContactId: {
                S: contactId
              },
              What: {
                S: key
              },
              Value: {
                S: '' + actualValue
              },
              Expiry: {
                N: '' + expiry
              }
            }
          }
        });
      }
    }

    // console.log('[INFO] persisting state: ' + JSON.stringify(batchItems, null, 2));

    await batchUpdateLarge(stateTable, batchItems);
  }
  catch (error) {
    console.log(`[ERROR] failed to perist customer state for contact id: ${contactId}`, error);
    throw error;
  }
}

/**
 * Batch update with a small list of items, making sure all are processed
 */
async function batchUpdateSmall(tableName, batchItems) {
  if (batchItems.length === 0) {
    return;
  }

  try {
    var request =
    {
      RequestItems:
      {
      }
    };

    request.RequestItems[tableName] = batchItems;

    var result = await dynamo.batchWriteItem(request).promise();

    while (result.UnprocessedItems[tableName] !== undefined) {
      request.RequestItems[tableName] = result.UnprocessedItems[tableName];
      result = await dynamo.batchWriteItem(request).promise();
    }
  }
  catch (error) {
    console.log('[ERROR] failed to batch update table with a small request', error);
    throw error;
  }
}

/**
 * Batch updates a table with a possibly large array of batch items
 */
async function batchUpdateLarge(tableName, batchItems) {
  try {
    var batch = [];

    while (batchItems.length > 0) {
      batch.push(batchItems.shift());

      if (batch.length === 25) {
        await batchUpdateSmall(tableName, batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await batchUpdateSmall(tableName, batch);
    }
  }
  catch (error) {
    console.log('[ERROR] failed to batch update table', error);
    throw error;
  }
}

/**
 * Fetches the state for the current contact id as a map
 */
module.exports.getParsedCustomerState = async function (stateTable, contactId)
{
  var stateItems = await module.exports.getStateItems(stateTable, contactId);

  var customerState = {};

  stateItems.forEach(stateItem => {
    customerState[stateItem.what] = stateItem.value;
  });

  var stateKeys = Object.keys(customerState);

  stateKeys.forEach(key => {
    try {
      var value = customerState[key].trim();

      if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
        customerState[key] = JSON.parse(value);
      }
    }
    catch (error) {
      console.log(`[ERROR] skipping parsing key: ${key} due to JSON parse failure of value: ${value}`, error);
    }
  });

  return customerState;
}

/**
 * Fetches the state for a customer using their contact id
 */
module.exports.getStateItems = async (stateTable, contactId) => {
  try {
    var statement = `SELECT * FROM "${stateTable}" WHERE "ContactId" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: contactId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    var stateItems = [];

    results.Items.forEach(item => {
      stateItems.push(makeStateItem(item));
    });

    /**
     * Keep scanning while we have more results
     */
    while (results.NextToken !== undefined) {
      console.log('[DEBUG] found additional state items to load');

      request.NextToken = results.NextToken;

      results = await dynamo.executeStatement(request).promise();

      results.Items.forEach(item => {
        stateItems.push(makeStateItem(item));
      });
    }

    return stateItems;
  }
  catch (error) {
    console.log('[ERROR] failed to load state items for contact: ' + contactId, error);
    throw error;
  }
};

/**
 * Inserts a weight into a rule
 */
module.exports.insertWeight = async (rulesTable, ruleSetId, ruleId, weight) => {
  try {
    var rule = await module.exports.getRule(rulesTable, ruleSetId, ruleId);
    rule.weights.push(weight);

    var newWeights = JSON.stringify(rule.weights);

    var statement = `UPDATE "${rulesTable}"` +
      ` SET "Weights" = ?` +
      ` WHERE "RuleSetId" = ?` +
      ` AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: newWeights
        },
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to insert weight into rule in Dynamo', error);
    throw error;
  }
};

/**
 * Deletes a weight from a rule
 */
module.exports.deleteWeight = async (rulesTable, ruleSetId, ruleId, weightId) => {
  try {
    var rule = await module.exports.getRule(rulesTable, ruleSetId, ruleId);

    var weights = [];

    rule.weights.forEach(weight => {
      if (weight.weightId !== weightId) {
        weights.push(weight);
      }
    });

    var newWeights = JSON.stringify(weights);

    var statement = `UPDATE "${rulesTable}"` +
      ` SET "Weights" = ?` +
      ` WHERE "RuleSetId" = ?` +
      ` AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: newWeights
        },
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to delete weight from rule in Dynamo', error);
    throw error;
  }
};

/**
 * Deletes a state key for a contact
 */
module.exports.deleteState = async (stateTable, contactId, what) => {
  try {
    var statement = `DELETE FROM "${stateTable}" WHERE "ContactId" = ? and "What" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: contactId
        },
        {
          S: what
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log(`[ERROR] failed to remove state key: $what from contact id: $contactId from Dynamo `, error);
    throw error;
  }
};

/**
 * Fetches a test from DynamoDB by botId
 */
module.exports.getTest = async (testsTable, testId) => {
  try {
    var statement = `SELECT * FROM "${testsTable}" WHERE "TestId" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: testId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1) {
      var item = results.Items[0];

      return makeTest(item);
    }
    else {
      throw new Error('Failed to find test for id: ' + testId);
    }
  }
  catch (error) {
    console.log('[ERROR] failed to load test from Dynamo', error);
    throw error;
  }
};

/**
 * Loads all batches from DynamoDB and applied optional filters,
 * cut down results due to table scan and no need for results
 */
module.exports.getBatches = async (verifyTable) =>
{
  try
  {
    // Select everything but the Results
    var statement = `SELECT "BatchId", "Expiry", "UserId", "Email", "StartTime", "EndTime", "Status", "Complete", "Success",
    "Warning", "Cause", "TestCount", "CompleteCount", "TestIds" FROM "${verifyTable}"`;

    var request = {
      Statement: statement,
      ConsistentRead: true
    };

    var results = await dynamo.executeStatement(request).promise();

    var batches = [];

    for (var i = 0; i < results.Items.length; i++)
    {
      var batch = await makeBatch(results.Items[i]);
      batches.push(batch);
    }

    /**
     * Keep scanning while we have more results
     */
    while (results.NextToken !== undefined)
    {
      request.NextToken = results.NextToken;
      results = await dynamo.executeStatement(request).promise();

      for (var i = 0; i < results.Items.length; i++)
      {
        var batch = await makeBatch(results.Items[i]);
        batches.push(batch);
      }
    }

    return batches;
  }
  catch (error) {
    console.log('[ERROR] failed to load batches from Dynamo', error);
    throw error;
  }
};

/**
 * Fetches a test from DynamoDB by batchId
 */
module.exports.getBatch = async (verifyTable, batchId) => {
  try {
    var statement = `SELECT * FROM "${verifyTable}" WHERE "BatchId" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: batchId
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1)
    {
      var item = results.Items[0];
      return await makeBatch(item);
    }
    else
    {
      throw new Error('Failed to find batch for id: ' + batchId);
    }
  }
  catch (error) {
    console.log('[ERROR] failed to load batch from Dynamo', error);
    throw error;
  }
};

/**
 * Update batch progress
 */
module.exports.updateBatchProgress = async (verifyTable, batchId, completeCount) =>
{
  try
  {
    var statement = `UPDATE "${verifyTable}"` +
        ` SET "CompleteCount" = ?` +
        ` WHERE "BatchId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: '' + completeCount
        },
        {
          S: batchId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to update batch progress in Dynamo', error);
    throw error;
  }
};


/**
 * Saves a batch in DDB pushing larger objects directly
 * to S3 and referencing them in the table
 */
module.exports.saveBatch = async (
  verifyTable, batchId, status,
  endTime, success, complete,
  warning, testResults, coverage,
  batchBucket,
  batchResultsKey,
  coverageResultsKey,
  error = undefined,) =>
{
  try
  {
    var statement;
    var request;

    var jsonTestResults = JSON.stringify(testResults);
    var jsonCoverage = JSON.stringify(coverage);

    // 300K max item size
    var maxAttributesLength = 307200;
    var s3SaveRequired = false;

    // Compress and base64 test result data
    var base64TestResults = Buffer.from(await gzip(jsonTestResults)).toString('base64');
    var base64Coverage = Buffer.from(await gzip(jsonCoverage)).toString('base64');

    console.info(`Compressed batch results from: ${jsonTestResults.length} bytes to ${base64TestResults.length} bytes (${100 - (base64TestResults.length / jsonTestResults.length * 100).toFixed(1)}% compression)`);
    console.info(`Compressed coverage results from: ${jsonCoverage.length} bytes to ${base64Coverage.length} bytes (${100 - (base64Coverage.length / jsonCoverage.length * 100).toFixed(1)}% compression)`);

    var totalLength = base64TestResults.length + base64Coverage.length;

    if (totalLength > maxAttributesLength)
    {
      s3SaveRequired = true;
      console.info(`Total length: ${totalLength} exceeds maximum length: ${maxAttributesLength}, S3 save is required`);
      await s3Utils.putObject(batchBucket, batchResultsKey, base64TestResults);
      await s3Utils.putObject(batchBucket, coverageResultsKey, base64Coverage);
    }

    statement = `UPDATE "${verifyTable}"` +
      ` SET "Status" = ?` +
      ` SET "EndTime" = ?` +
      ` SET "Complete" = ?` +
      ` SET "Success" = ?` +
      ` SET "Warning" = ?` +
      ` SET "Results" = ?` +
      ` SET "Coverage" = ?`;

    if (error !== undefined)
    {
      statement += ` SET "Error" = ?`;
    }

    if (s3SaveRequired)
    {
      statement += ` SET "Bucket" = ?`;
    }

    statement += ` WHERE "BatchId" = ?`;

    request = {
      Statement: statement,
      Parameters: [
        {
          S: '' + status
        },
        {
          S: endTime.format('YYYY-MM-DDTHH:mm:ss.SSSZ')
        },
        {
          S: 'true',
        },
        {
          S: '' + success
        },
        {
          S: '' + warning
        },
        {
          S: s3SaveRequired ? batchResultsKey : base64TestResults
        },
        {
          S: s3SaveRequired ? coverageResultsKey : base64Coverage
        }
      ]
    };

    if (error !== undefined)
    {
      request.Parameters.push(
      {
        S: error.message
      });
    }

    if (s3SaveRequired)
    {
      request.Parameters.push(
      {
        S: batchBucket
      });
    }

    request.Parameters.push(
    {
      S: batchId
    });

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to update batch in Dynamo', error);
    throw error;
  }
};

/**
 * Clones a rule set and it's rules, abandoning end points
 */
module.exports.cloneRuleSet = async function (ruleSetsTable, rulesTable, newRuleSetName, ruleSet) {
  try {
    var newRuleSetId = await module.exports.insertRuleSet(ruleSetsTable, newRuleSetName,
      ruleSet.enabled, ruleSet.description, undefined, ruleSet.folder);

    for (var i = 0; i < ruleSet.rules.length; i++) {
      var rule = ruleSet.rules[i];

      await module.exports.insertRule(rulesTable, newRuleSetId, rule.name,
        rule.enabled, rule.description, rule.priority, rule.activation,
        rule.type, rule.params, rule.weights);
    }

    console.log('[INFO] finished cloning rule set');

    return newRuleSetId;
  }
  catch (error) {
    console.log('[ERROR] failed to clone rule set', error);
    throw error;
  }
}

/**
 * Renames a rule, assumes uniqueness checking is already done
 */
module.exports.updateRuleName = async function (rulesTable, ruleSetId, ruleId, ruleName) {
  try {
    var statement = `UPDATE "${rulesTable}"` +
      ` SET "Name" = ?` +
      ` WHERE "RuleSetId" = ? AND` +
      ` "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleName,
        },
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to update rule set name', error);
    throw error;
  }
}

/**
 * Moves a rule set by updating it's folder location
 */
var moveRuleSet = async function (ruleSetsTable, ruleSetId, newFolder)
{
  try
  {
    var statement = `UPDATE "${ruleSetsTable}"` +
      ` SET "Folder" = ?` +
      ` WHERE "RuleSetId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: newFolder,
        },
        {
          S: ruleSetId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to move a rule set', error);
    throw error;
  }
}

/**
 * Moves rule sets by updating their folder location
 */
module.exports.moveRuleSets = async function (ruleSetsTable, ruleSetIds, newFolder)
{
  try
  {
    for (var i = 0; i < ruleSetIds.length; i++)
    {
      await moveRuleSet(ruleSetsTable, ruleSetIds[i], newFolder);

    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to move rule sets', error);
    throw error;
  }
}

/**
 * Moves a test by updating it's folder location
 */
var moveTest = async function (testsTable, testId, newFolder)
{
  try
  {
    var statement = `UPDATE "${testsTable}"` +
      ` SET "Folder" = ?` +
      ` WHERE "TestId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: newFolder,
        },
        {
          S: testId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to move a test', error);
    throw error;
  }
}

/**
 * Moves tests by updating their folder location
 */
module.exports.moveTests = async function (testsTable, testIds, newFolder)
{
  try
  {
    for (var i = 0; i < testIds.length; i++)
    {
      await moveTest(testsTable, testIds[i], newFolder);

    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to move tests', error);
    throw error;
  }
}

/**
 * Copies a test and changes it's folder location
 */
var copyTest = async function (testsTable, testId, copyFolder)
{
  try
  {
    var test = await module.exports.getTest(testsTable, testId);

    if (test !== undefined)
    {
      if (test.folder !== copyFolder)
      {
        await module.exports.insertTest(testsTable, test.name,
          test.productionReady,
          copyFolder, test.testReference,
          test.description, test.endPoint,
          test.testDateTime, test.customerPhoneNumber,
          test.payload, test.contactAttributes);
      }
      else
      {
        console.error('Skipping test as it would be copied onto itself: ' + JSON.stringify(test));
      }
    }
    else
    {
      throw new Error('Test not found to copy using id: ' + testId);
    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to copy test', error);
    throw error;
  }
}

/**
 * Copies tests to a new folder location
 */
module.exports.copyTests = async function (testsTable, testIds, copyFolder)
{
  try
  {
    for (var i = 0; i < testIds.length; i++)
    {
      await copyTest(testsTable, testIds[i], copyFolder);

    }
  }
  catch (error)
  {
    console.log('[ERROR] failed to copy tests', error);
    throw error;
  }
}

/**
 * Renames a rule set and all of the rules that refer to it
 */
module.exports.renameRuleSet = async function (ruleSetsTable, rulesTable, ruleSetName, ruleSet, referencingRules) {
  try {
    for (var i = 0; i < referencingRules.length; i++) {
      var rule = referencingRules[i];

      if (rule.type === 'DTMFMenu') {
        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.startsWith('dtmf') && rule.params[key] === ruleSet.name) {
            rule.params[key] = ruleSetName;
          }
        });

        if (rule.params.errorRuleSetName === ruleSet.name) {
          rule.params.errorRuleSetName = ruleSetName;
        }
      }

      if (rule.type === 'NLUMenu') {
        var keys = Object.keys(rule.params);

        keys.forEach(key => {
          if (key.startsWith('intentRuleSet_') && rule.params[key] === ruleSet.name) {
            rule.params[key] = ruleSetName;
          }
        });

        if (rule.params.errorRuleSetName === ruleSet.name) {
          rule.params.errorRuleSetName = ruleSetName;
        }
      }

      if (rule.type === 'RuleSet') {
        if (rule.params.ruleSetName === ruleSet.name) {
          rule.params.ruleSetName = ruleSetName;
        }
      }

      if (rule.type === 'DTMFInput') {
        if (rule.params.errorRuleSetName === ruleSet.name) {
          rule.params.errorRuleSetName = ruleSetName;
        }
      }

      await updateRuleParams(rulesTable, rule);
    }

    await updateRuleSetName(ruleSetsTable, ruleSet.ruleSetId, ruleSetName);

    console.log('[INFO] finished renaming rule set')
  }
  catch (error) {
    console.log('[ERROR] failed to rename rule set', error);
    throw error;
  }
}

/**
 * Updates a rule set name, this assumes that all references to this rule set
 * have been renamed via renameRuleSet
 */
async function updateRuleSetName(ruleSetsTable, ruleSetId, newName) {
  try {
    var statement = `UPDATE "${ruleSetsTable}"` +
      ` SET "Name" = ?` +
      ` WHERE "RuleSetId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: newName
        },
        {
          S: ruleSetId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to update rule set name', error);
    throw error;
  }
}

/**
 * Updates the params for this rule in DynamoDB used during rule set renaming
 */
async function updateRuleParams(rulesTable, rule) {
  try {
    var statement = `UPDATE "${rulesTable}"` +
      ` SET "Params" = ?` +
      ` WHERE "RuleSetId" = ?` +
      ` AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: JSON.stringify(rule.params)
        },
        {
          S: rule.ruleSetId
        },
        {
          S: rule.ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to update rule params', error);
    throw error;
  }
}

/**
 * Deletes a ruleset and its rules from DynamoDB
 */
module.exports.deleteRuleSetAndRules = async (ruleSetsTable, rulesTable, ruleSet) => {
  try {
    for (var i = 0; i < ruleSet.rules.length; i++) {
      await module.exports.deleteRule(rulesTable, ruleSet.ruleSetId, ruleSet.rules[i].ruleId);
    }

    await deleteRuleSet(ruleSetsTable, ruleSet.ruleSetId);
  }
  catch (error) {
    console.log('[ERROR] failed to delete rule set and rules from Dynamo', error);
    throw error;
  }
};

/**
 * Deletes a ruleset from DynamoDB (module private function)
 */
async function deleteRuleSet(ruleSetsTable, ruleSetId) {
  try {
    var statement = `DELETE FROM "${ruleSetsTable}" WHERE "RuleSetId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleSetId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to delete rule set from Dynamo', error);
    throw error;
  }
}

/**
 * Deletes a rule from DynamoDB
 */
module.exports.deleteRule = async (rulesTable, ruleSetId, ruleId) => {
  try {
    var statement = `DELETE FROM "${rulesTable}" WHERE "RuleSetId" = ? AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to delete rule from Dynamo', error);
    throw error;
  }
};

/**
 * Deletes an end point from DynamoDB
 */
module.exports.deleteEndPoint = async (endPointsTable, endPointId) => {
  try {
    var statement = `DELETE FROM "${endPointsTable}" WHERE "EndPointId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: endPointId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to delete end point from Dynamo', error);
    throw error;
  }
};

/**
 * Deletes a user from DynamoDB
 */
module.exports.deleteUser = async (usersTable, userId) => {
  try {
    var statement = `DELETE FROM "${usersTable}" WHERE "UserId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: userId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to delete user from Dynamo', error);
    throw error;
  }
};

/**
 * Deletes test from DynamoDB by testId
 */
module.exports.deleteTest = async (testsTable, testId) => {
  try {
    var statement = `DELETE FROM "${testsTable}" WHERE "TestId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: testId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to delete test from Dynamo', error);
    throw error;
  }
};

/**
 * Updates a config item
 */
module.exports.updateConfigItem = async (configTable, configKey, configData) => {
  try {
    var request = {
      TableName: configTable,
      Item: {
        ConfigKey: {
          S: configKey
        },
        ConfigData: {
          S: configData
        },
        LastUpdate: {
          S: moment().utc().format()
        }
      }
    };

    await dynamo.putItem(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to update config item in Dynamo', error);
    throw error;
  }

};

/**
 * Loadas all config items into a simple key / value map
 */
module.exports.getConfigItems = async (configTable) => {
  try {
    var statement = `SELECT * FROM "${configTable}"`;

    var request = {
      Statement: statement,
      ConsistentRead: true
    };

    // TODO this could paginate for large config tables
    var results = await dynamo.executeStatement(request).promise();

    console.info(`Loaded: ${results.Items.length} config items`);

    var configItems = {};

    results.Items.forEach(item => {
      var configItem = makeConfigItem(item);

      var value = configItem.configData.trim();

      if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
        try {
          configItem.configData = JSON.parse(value);
        }
        catch (parseError) {
          console.error(`Failed to parse JSON config key: ${configItem.configKey}`, parseError);
        }
      }

      configItems[configItem.configKey] = configItem.configData;
    });

    return configItems;
  }
  catch (error) {
    console.error('Failed to load all config items', error);
    throw error;
  }
}

/**
 * Load a config item by key
 */
module.exports.getConfigItem = async (configTable, configKey) => {
  try {
    var statement = `SELECT * FROM "${configTable}"` +
      ` WHERE "ConfigKey" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: configKey
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1) {
      return makeConfigItem(results.Items[0]);
    }

    return undefined;
  }
  catch (error) {
    console.log('[ERROR] failed to load config item for key: ' + configKey, error);
    throw error;
  }
};

/**
 * Checks if this test exists by name
 */
module.exports.checkTestExistsByName = async (testsTable, testName) => {
  try {
    var statement = `SELECT * FROM "${testsTable}"` +
      ` WHERE "Name" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: testName
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();
    return (results.Items && results.Items.length > 0);
  }
  catch (error) {
    console.log('[ERROR] failed to check for test existence in DynamoDB', error);
    throw error;
  }
};

/**
 * Checks if this rule set exists by name
 */
module.exports.checkRuleSetExistsByName = async (ruleSetsTable, ruleSetName) => {
  try {
    var statement = `SELECT * FROM "${ruleSetsTable}"` +
      ` WHERE "Name" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: ruleSetName
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();
    return (results.Items && results.Items.length > 0);
  }
  catch (error) {
    console.log('[ERROR] failed to check for rule set existence in DynamoDB', error);
    throw error;
  }
};

/**
 * Checks if this rule exists in this rule set by name
 */
module.exports.checkRuleExistsByName = async (rulesTable, ruleSetId, ruleName) => {
  try {
    var statement = `SELECT * FROM "${rulesTable}"` +
      ` WHERE "RuleSetId" = ? AND "Name" = ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: ruleSetId
        },
        {
          S: ruleName
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();
    return (results.Items && results.Items.length > 0);
  }
  catch (error) {
    console.log('[ERROR] failed to check for rule existence in DynamoDB', error);
    throw error;
  }
};

/**
 * Updates a rule set
 */
module.exports.updateRuleSet = async (ruleSetsTable, ruleSetId,
  ruleSetEnabled, ruleSetDescription, endPoints, folder) => {
  try {
    if (endPoints.length > 0) {
      var statement = `UPDATE "${ruleSetsTable}"` +
        ` SET "Enabled" = ?` +
        ` SET "Description" = ?` +
        ` SET "EndPoints" = ?` +
        ` SET "Folder" = ?` +
        ` WHERE "RuleSetId" = ?`;

      var request = {
        Statement: statement,
        Parameters: [
          {
            S: '' + ruleSetEnabled
          },
          {
            S: ruleSetDescription
          },
          {
            SS: endPoints
          },
          {
            S: folder
          },
          {
            S: ruleSetId
          }
        ]
      };

      await dynamo.executeStatement(request).promise();
    }
    else {
      var statement = `UPDATE "${ruleSetsTable}"` +
        ` SET "Enabled" = ?` +
        ` SET "Description" = ?` +
        ` SET "Folder" = ?` +
        ` REMOVE "EndPoints"` +
        ` WHERE "RuleSetId" = ?`;

      var request = {
        Statement: statement,
        Parameters: [
          {
            S: '' + ruleSetEnabled
          },
          {
            S: ruleSetDescription
          },
          {
            S: folder
          },
          {
            S: ruleSetId
          }
        ]
      };

      await dynamo.executeStatement(request).promise();
    }
  }
  catch (error) {
    console.log('[ERROR] failed to update rule set in Dynamo', error);
    throw error;
  }
};

/**
 * Updates a rule
 */
module.exports.updateRule = async (rulesTable, ruleSetId, ruleId,
  ruleEnabled, ruleDescription, rulePriority, ruleActivation,
  ruleType, params) => {
  try {
    var statement = `UPDATE "${rulesTable}"` +
      ` SET "Enabled" = ?` +
      ` SET "Description" = ?` +
      ` SET "Priority" = ?` +
      ` SET "Activation" = ?` +
      ` SET "Type" = ?` +
      ` SET "Params" = ?` +
      ` WHERE "RuleSetId" = ?` +
      ` AND "RuleId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: '' + ruleEnabled
        },
        {
          S: ruleDescription
        },
        {
          S: rulePriority
        },
        {
          S: ruleActivation
        },
        {
          S: ruleType
        },
        {
          S: JSON.stringify(params)
        },
        {
          S: ruleSetId
        },
        {
          S: ruleId
        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to update rule in Dynamo', error);
    throw error;
  }
};

/**
 * Updates a test
 */
module.exports.updateTest = async (testsTable, testId, name, productionReady, folder, testReference,
                                   description, endPoint, testDateTime,
                                   customerPhoneNumber, payload, contactAttributes) =>
{
  try
  {
    if (contactAttributes === undefined)
    {
      contactAttributes = {};
    }

    var contactAttributesJson = JSON.stringify(contactAttributes);

    var statement = `UPDATE "${testsTable}"` +
      ` SET "Name" = ?` +
      ` SET "ProductionReady" = ?` +
      ` SET "Folder" = ?` +
      ` SET "TestReference" = ?` +
      ` SET "Description" = ?` +
      ` SET "EndPoint" = ?` +
      ` SET "TestDateTime" = ?` +
      ` SET "CustomerPhoneNumber" = ?` +
      ` SET "Payload" = ?` +
      ` SET "ContactAttributes" = ?` +
      ` WHERE "TestId" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: name
        },
        {
          S: '' + productionReady
        },
        {
          S: folder
        },
        {
          S: testReference
        },
        {
          S: description
        },
        {
          S: endPoint
        },
        {
          S: testDateTime
        },
        {
          S: customerPhoneNumber
        },
        {
          S: payload
        },
        {
          S: contactAttributesJson
        },
        {
          S: testId
        }
      ]
    };

    console.info('Updating test with: ' + JSON.stringify(request, null, 2));

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to update test in Dynamo', error);
    throw error;
  }
};

/**
 * Fetches a user by API key
 */
module.exports.getUserByAPIKey = async (usersTable, apiKey) => {
  try {
    var statement = `SELECT * FROM "${usersTable}"."APIKeyIndex"` +
      ` WHERE "APIKey" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: apiKey
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1) {
      return makeUser(results.Items[0]);
    }

    console.error('Failed to find user for API key');
    return undefined;
  }
  catch (error) {
    console.error('Failed to find user for API key', error);
    throw error;
  }
}

/**
 * Fetches a user by email address
 */
module.exports.getUserByEmailAddress = async (usersTable, emailAddress) => {
  try {
    var statement = `SELECT * FROM "${usersTable}"."EmailAddressIndex"` +
      ` WHERE "EmailAddress" = ?`;

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: emailAddress
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    if (results.Items && results.Items.length === 1) {
      return makeUser(results.Items[0]);
    }

    console.log('[INFO] failed to find user for email address key');
    return undefined;
  }
  catch (error) {
    console.log('[ERROR] failed to find user by email address', error);
    throw error;
  }
}

/**
 * Inserts a new end point
 */
module.exports.insertEndPoint = async (endPointsTable, name, description, inboundNumbers, enabled) => {
  try {
    var endPointId = uuidv4();

    var request = {
      TableName: endPointsTable,
      Item: {
        EndPointId: {
          S: endPointId
        },
        Name: {
          S: name
        },
        Description: {
          S: description
        },
        Enabled: {
          S: '' + enabled
        }
      }
    };

    if (inboundNumbers.length > 0)
    {
      request.Item.InboundNumbers = {
        SS: inboundNumbers
      };
    }

    await dynamo.putItem(request).promise();
    return endPointId;
  }
  catch (error) {
    console.log('[ERROR] failed to insert end point into Dynamo', error);
    throw error;
  }
}

/**
 * Inserts a new user
 */
module.exports.insertUser = async (usersTable, firstName, lastName,
  emailAddress, userRole, apiKey, userEnabled) => {
  try {
    var userId = uuidv4();

    var request = {
      TableName: usersTable,
      Item: {
        UserId: {
          S: userId
        },
        FirstName: {
          S: firstName
        },
        LastName: {
          S: lastName
        },
        EmailAddress: {
          S: emailAddress
        },
        UserRole: {
          S: userRole
        },
        APIKey: {
          S: apiKey
        },
        UserEnabled: {
          S: '' + userEnabled
        }
      }
    };

    await dynamo.putItem(request).promise();
    return userId;
  }
  catch (error) {
    console.log('[ERROR] failed to insert user into Dynamo', error);
    throw error;
  }
}

/**
 * Inserts a call history record
 */
module.exports.insertCallHistory = async (callHistoryTable, phoneNumber, when, action) => {
  try {

    var request = {
      TableName: callHistoryTable,
      Item: {
        PhoneNumber: {
          S: phoneNumber
        },
        When: {
          S: when
        },
        Action: {
          S: action
        }
      }
    };

    await dynamo.putItem(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to insert call history record into DynamoDB', error);
    throw error;
  }
};

/**
 * Inserts a state record for a customer with a standard 24 hour expiry
 * handling converting complex objects to JSON as required
 */
module.exports.insertState = async (stateTable, contactId, what, value) => {
  try {
    var expiry = Math.floor(new Date().getTime() / 1000) + 24 * 60 * 60;

    var actualValue = value;

    // Handle object serialisation by converting them to JSON
    if (typeof actualValue === 'object') {
      actualValue = JSON.stringify(actualValue);
    }

    var request = {
      TableName: stateTable,
      Item: {
        ContactId: {
          S: contactId
        },
        What: {
          S: what
        },
        Value: {
          S: actualValue
        },
        Expiry: {
          N: '' + expiry
        }
      }
    };

    await dynamo.putItem(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to insert state into Dynamo', error);
    throw error;
  }
};

/**
 * Updates a user in DynamoDB assumes checks have been made to prevent duplicate
 * email and api keys
 */
module.exports.updateUser = async (usersTable,
  userId, firstName, lastName, emailAddress,
  userRole, apiKey, enabled) => {
  try {
    var statement = `UPDATE "${usersTable}"` +
      ` SET "UserEnabled" = ?` +
      ` SET "FirstName" = ?` +
      ` SET "LastName" = ?` +
      ` SET "APIKey" = ?` +
      ` SET "EmailAddress" = ?` +
      ` SET "UserRole" = ?` +
      ` WHERE "UserId" = ?`;

    if (apiKey === '') {
      statement = `UPDATE "${usersTable}"` +
        ` SET "UserEnabled" = ?` +
        ` SET "FirstName" = ?` +
        ` SET "LastName" = ?` +
        ` SET "EmailAddress" = ?` +
        ` SET "UserRole" = ?` +
        ` WHERE "UserId" = ?`;
    }

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: '' + enabled
        },
        {
          S: firstName
        },
        {
          S: lastName
        },
        {
          S: apiKey
        },
        {
          S: emailAddress
        },
        {
          S: userRole
        },
        {
          S: userId
        }
      ]
    };

    if (apiKey === '') {
      request.Parameters.splice(3, 1);
    }

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to update user into Dynamo', error);
    throw error;
  }
}

/**
 * Updates an end point in DynamoDB
 */
module.exports.updateEndPoint = async (endPointsTable,
  endPointId, description, inboundNumbers, enabled) =>
{
  try
  {
    if (inboundNumbers.length > 0)
    {
      var statement = `UPDATE "${endPointsTable}"` +
        ` SET "Enabled" = ?` +
        ` SET "Description" = ?` +
        ` SET "InboundNumbers" = ?` +
        ` WHERE "EndPointId" = ?`;

      var request = {
        Statement: statement,
        Parameters: [
          {
            S: '' + enabled
          },
          {
            S: description,
          },
          {
            SS: inboundNumbers,
          },
          {
            S: endPointId
          }
        ]
      };

      await dynamo.executeStatement(request).promise();
    }
    else
    {
      var statement = `UPDATE "${endPointsTable}"` +
        ` SET "Enabled" = ?` +
        ` SET "Description" = ?` +
        ` REMOVE "InboundNumbers"` +
        ` WHERE "EndPointId" = ?`;

      var request = {
        Statement: statement,
        Parameters: [
          {
            S: '' + enabled
          },
          {
            S: description,
          },
          {
            S: endPointId
          }
        ]
      };

      await dynamo.executeStatement(request).promise();
    }
  }
  catch (error) {
    console.log('[ERROR] failed to update end point into Dynamo', error);
    throw error;
  }
}

/**
 * Inserts a rule set into DynamoDB
 */
module.exports.insertRuleSet = async (ruleSetsTable, ruleSetName,
  ruleSetEnabled, ruleSetDescription, endPoints, folder) => {
  try {
    var ruleSetId = uuidv4();

    var request = {
      TableName: ruleSetsTable,
      Item: {
        RuleSetId: {
          S: ruleSetId
        },
        Name: {
          S: ruleSetName
        },
        Enabled: {
          S: '' + ruleSetEnabled
        },
        Description: {
          S: ruleSetDescription
        },
        Folder: {
          S: folder
        }
      }
    };

    if (endPoints !== undefined && endPoints.length > 0) {
      request.Item.EndPoints = { SS: endPoints };
    }

    await dynamo.putItem(request).promise();
    return ruleSetId;
  }
  catch (error) {
    console.log('[ERROR] failed to insert rule set into Dynamo', error);
    throw error;
  }
};

/**
 * Inserts a rule into DynamoDB
 */
module.exports.insertRule = async (rulesTable, ruleSetId, ruleName,
  ruleEnabled, ruleDescription, rulePriority, ruleActivation,
  ruleType, params, weights) => {
  try {
    var ruleId = uuidv4();

    weights.forEach(weight => {
      weight.weightId = uuidv4();
    });

    var request = {
      TableName: rulesTable,
      Item: {
        RuleSetId: {
          S: ruleSetId
        },
        RuleId: {
          S: ruleId
        },
        Name: {
          S: ruleName
        },
        Enabled: {
          S: '' + ruleEnabled
        },
        Description: {
          S: ruleDescription
        },
        Priority: {
          S: rulePriority
        },
        Activation: {
          S: ruleActivation
        },
        Type: {
          S: ruleType
        },
        Params: {
          S: JSON.stringify(params)
        },
        Weights: {
          S: JSON.stringify(weights)
        }
      }
    };
    await dynamo.putItem(request).promise();
    return ruleId;
  }
  catch (error) {
    console.log('[ERROR] failed to insert rule into Dynamo', error);
    throw error;
  }
};

/**
 * Helper function that imports tests, identifying existing tests based on distinct folder + name
 * and replacing them.
 */
module.exports.importTests = async (testsTable, testsToImport) =>
{
  try
  {
    var existingTests = await module.exports.getTests(testsTable);

    var inserted = 0;
    var replaced = 0;
    var skipped = 0;

    // Walk over the existing rules to see if this is an insert or update
    for (var i = 0; i < testsToImport.length; i++)
    {
      var testToImport = testsToImport[i];

      console.info('Processing test to import: ' + JSON.stringify(testToImport, null, 2));

      if (testToImport.productionReady)
      {
        // Find existing tests by folder and name
        var existingTest = existingTests.find(test => (test.folder === testToImport.folder && test.name === testToImport.name));

        if (existingTest !== undefined)
        {
          replaced++;
          console.info('Deleting existing test: ' + JSON.stringify(existingTest, null, 2));
          await module.exports.deleteTest(testsTable, existingTest.testId);
        }
        else
        {
          inserted++;
        }

        console.info('Inserting test: ' + JSON.stringify(testToImport, null, 2));

        await module.exports.insertTest(testsTable, testToImport.name, testToImport.productionReady,
          testToImport.folder, testToImport.testReference,
          testToImport.description, testToImport.endPoint, testToImport.testDateTime,
          testToImport.customerPhoneNumber, testToImport.payload, testToImport.contactAttributes);
      }
      else
      {
        skipped++;
        console.info('Skipping non-production ready test: ' + JSON.stringify(testToImport, null, 2));
      }
    }

    console.info(`Replaced: ${replaced} Inserted: ${inserted} Skipped: ${skipped} tests`);

    return {
      replaced: replaced,
      inserted: inserted,
      skipped: skipped
    };
  }
  catch (error)
  {
    console.error('Failed to import tests into Dynamo', error);
    throw error;
  }
};

/**
 * Helper function that can import rule sets and also create missing end points
 */
module.exports.importRuleSets = async (ruleSetsTable, rulesTable, endPointsTable, newRuleSets) => {
  try {
    var existingRuleSets = await module.exports.getRuleSetsAndRules(ruleSetsTable, rulesTable);

    // Load the existing end points
    var existingEndPoints = await module.exports.getEndPoints(endPointsTable);

    // Track end point names to create for each batch
    var newEndPointNames = new Set();

    // Walk over the existing rules to see if this is an insert or update
    for (var i = 0; i < newRuleSets.length; i++) {
      var newRuleSet = newRuleSets[i];
      var existingRuleSet = existingRuleSets.find(ruleSet => ruleSet.name === newRuleSet.name);

      if (existingRuleSet !== undefined) {
        await module.exports.deleteRuleSetAndRules(ruleSetsTable, rulesTable, existingRuleSet);
      }

      // Make sure we have a valid folder
      var folder = newRuleSet.folder;

      if (folder === undefined)
      {
        folder = '/';
      }

      if (newRuleSet.endPoints === undefined)
      {
        newRuleSet.endPoints = [];
      }

      newRuleSet.endPoints.forEach(newEndPointName => {
        if (existingEndPoints.find(existingEndPoint => existingEndPoint.name === newEndPointName) === undefined)
        {
          console.info(`Found new end point: ${newEndPointName} to create on ruleset: ${newRuleSet.name}`)
          newEndPointNames.add(newEndPointName);
        }
      });

      var newRuleSetId = await module.exports.insertRuleSet(ruleSetsTable,
        newRuleSet.name,
        newRuleSet.enabled,
        newRuleSet.description,
        newRuleSet.endPoints,
        folder);

      for (var r = 0; r < newRuleSet.rules.length; r++) {
        var newRule = newRuleSet.rules[r];
        await module.exports.insertRule(rulesTable, newRuleSetId,
          newRule.name,
          newRule.enabled,
          newRule.description,
          newRule.priority,
          newRule.activation,
          newRule.type,
          newRule.params,
          newRule.weights);
      }
    }

    var newEndPointNamesArray = Array.from(newEndPointNames);

    for (var i = 0; i < newEndPointNamesArray.length; i++)
    {
      console.info('Creating missing end point: ' + newEndPointNamesArray[i]);
      await module.exports.insertEndPoint(endPointsTable, newEndPointNamesArray[i], '', [], true);
    }

    console.log(`[INFO] successfully imported: ${newRuleSets.length} rulesets`);
  }
  catch (error) {
    console.log('[ERROR] failed to import rule sets into Dynamo', error);
    throw error;
  }
};

/**
 * Inserts a test into DynamoDB
 */
module.exports.insertTest = async (testsTable, name, productionReady, folder, testReference,
  description, endPoint, testDateTime, customerPhoneNumber, payload, contactAttributes) => {
  try {
    var testId = uuidv4();

    if (contactAttributes === undefined)
    {
      contactAttributes = {};
    }

    var request = {
      TableName: testsTable,
      Item: {
        TestId: {
          S: testId
        },
        Name: {
          S: name
        },
        ProductionReady: {
          S: '' + productionReady
        },
        Folder: {
          S: folder
        },
        TestReference: {
          S: testReference
        },
        Description: {
          S: description
        },
        EndPoint: {
          S: endPoint
        },
        TestDateTime: {
          S: testDateTime
        },
        CustomerPhoneNumber: {
          S: customerPhoneNumber
        },
        Payload: {
          S: payload
        },
        ContactAttributes: {
          S: JSON.stringify(contactAttributes)
        }
      }
    };

    console.info('About to insert test: ' + JSON.stringify(request, null, 2));

    await dynamo.putItem(request).promise();
    return testId;
  }
  catch (error) {
    console.log('[ERROR] failed to insert test into Dynamo', error);
    throw error;
  }
};

/**
 * Inserts a batch into the verify table
 */
module.exports.insertBatch = async (verifyTable, user, version, folder, recursive, providedTestIds, testIds, status, start) =>
{
  try
  {
    var batchId = uuidv4();

    var expiryTimestamp = moment().utc().add(+process.env.BATCH_EXPIRY_HOURS, 'hours').format();
    var expiry = Math.floor(new Date().getTime() / 1000) + process.env.BATCH_EXPIRY_HOURS * 60 * 60;

    var request = {
      TableName: verifyTable,
      Item: {
        BatchId: {
          S: batchId
        },
        Version: {
          S: version,
        },
        UserId: {
          S: user.userId
        },
        Email: {
          S: user.emailAddress
        },
        Folder: {
          S: folder
        },
        Recursive: {
          S: '' + recursive
        },
        StartTime: {
          S: start.format('YYYY-MM-DDTHH:mm:ss.SSSZ')
        },
        Status: {
          S: status
        },
        Complete: {
          S: 'false'
        },
        ProvidedTestIds: {
          S: '' + providedTestIds
        },
        TestIds: {
          SS: testIds
        },
        TestCount: {
          S: '' + testIds.length
        },
        CompleteCount: {
          S: '0'
        },
        ExpiryTimestamp:
        {
          S: expiryTimestamp
        },
        Expiry: {
          N: '' + expiry
        }
      }
    };

    await dynamo.putItem(request).promise();
    return batchId;
  }
  catch (error) {
    console.log('[ERROR] failed to insert batch into Dynamo', error);
    throw error;
  }
};

/**
 * Makes a rule from a DynamoDB item
 */
function makeRule(item) {
  var rule = {
    ruleSetId: item.RuleSetId.S,
    ruleId: item.RuleId.S,
    name: item.Name.S,
    description: item.Description.S,
    priority: item.Priority.S,
    activation: item.Activation.S,
    type: item.Type.S,
    enabled: item.Enabled.S === 'true',
    params: {},
    weights: []
  };

  if (item.Params !== undefined && item.Params.S !== undefined && item.Params.S !== '') {
    rule.params = JSON.parse(item.Params.S);
  }

  if (item.Weights !== undefined && item.Weights.S !== undefined && item.Weights.S !== '') {
    rule.weights = JSON.parse(item.Weights.S);
  }

  return rule;
}

/**
 * Makes a rule set from a DynamoDB item
 */
function makeRuleSet(item) {
  var ruleSet = {
    ruleSetId: item.RuleSetId.S,
    name: item.Name.S,
    description: item.Description.S,
    enabled: item.Enabled.S === 'true',
    endPoints: []
  };

  if (item.EndPoints !== undefined) {
    ruleSet.endPoints = item.EndPoints.SS;
  }

  if (item.Folder !== undefined)
  {
    ruleSet.folder = item.Folder.S;
  }
  else
  {
    ruleSet.folder = '/';
  }

  return ruleSet;
}

/**
 * Makes a test from a DynamoDB item
 */
function makeTest(item)
{
  var test =
  {
    testId: item.TestId.S,
    name: item.Name.S,
    productionReady: true,
    folder: item.Folder.S,
    testReference: item.TestReference.S,
    description: item.Description.S,
    endPoint: item.EndPoint.S,
    testDateTime: item.TestDateTime.S,
    customerPhoneNumber: item.CustomerPhoneNumber.S,
    payload: item.Payload.S,
    contactAttributes: {}
  };

  if (item.Folder !== undefined)
  {
    test.folder = item.Folder.S;
  }
  else
  {
    test.folder = '/';
  }

  if (item.ProductionReady !== undefined)
  {
    test.productionReady = item.ProductionReady.S === 'true';
  }

  if (item.ContactAttributes !== undefined)
  {
    test.contactAttributes = JSON.parse(item.ContactAttributes.S);
  }

  return test;
}

/**
 * Makes an end point from a DynamoDB item
 */
function makeEndPoint(item) {

  var endPoint = {
    endPointId: item.EndPointId.S,
    name: item.Name.S,
    description: item.Description.S,
    inboundNumbers: [],
    enabled: item.Enabled.S === 'true'
  };

  if (item.InboundNumbers !== undefined) {
    endPoint.inboundNumbers = item.InboundNumbers.SS;
  }

  return endPoint;
}

/**
 * Makes a batch from a DynamoDB item
 */
async function makeBatch(item)
{
  var batch =
  {
    batchId: item.BatchId.S,
    success: makeBoolean(item, 'Success'),
    warning: makeBoolean(item, 'Warning'),
    complete: makeBoolean(item, 'Complete'),
    testCount: 0,
    completeCount: 0
  };

  if (item.UserId !== undefined)
  {
    batch.userId = item.UserId.S;
  }

  if (item.Email !== undefined)
  {
    batch.email = item.Email.S;
  }

  if (item.Status !== undefined)
  {
    batch.status = item.Status.S;
  }

  if (item.Expiry !== undefined)
  {
    batch.expiry = +item.Expiry.N;
  }

  if (item.ExpiryTimestamp !== undefined)
  {
    batch.expiryTimestamp = item.ExpiryTimestamp.S;
  }

  if (item.TestIds !== undefined)
  {
    batch.testIds = item.TestIds.SS;
  }

  if (item.Folder !== undefined)
  {
    batch.folder = item.Folder.S;
  }

  if (item.Cause !== undefined)
  {
    batch.cause = item.Cause.S;
  }

  if (item.StartTime !== undefined)
  {
    batch.startTime = item.StartTime.S;
  }

  if (item.EndTime !== undefined)
  {
    batch.endTime = item.EndTime.S;
  }

  if (item.TestCount !== undefined)
  {
    batch.testCount = +item.TestCount.S;
  }

  if (item.CompleteCount !== undefined)
  {
    batch.completeCount = +item.CompleteCount.S;
  }

  var s3Bucket = undefined;

  if (item.Bucket !== undefined)
  {
    s3Bucket = item.Bucket.S;
  }

  // Decompress results
  if (item.Results !== undefined)
  {
    var decompressed = undefined;

    // Load from S3 if required
    if (s3Bucket !== undefined)
    {
      console.info(`Loading batch results from s3://${s3Bucket}/${item.Results.S}`);
      var compressed = await s3Utils.getObject(s3Bucket, item.Results.S);
      decompressed = await ungzip(Buffer.from(compressed, 'base64'));
    }
    else
    {
      decompressed = await ungzip(Buffer.from(item.Results.S, 'base64'));
    }

    batch.results = JSON.parse(decompressed.toString());
  }

  // Decompress coverage
  if (item.Coverage !== undefined)
  {
    var decompressed = undefined;

    // Load from S3 if required
    if (s3Bucket !== undefined)
    {
      console.info(`Loading coverage results from s3://${s3Bucket}/${item.Coverage.S}`);
      var compressed = await s3Utils.getObject(s3Bucket, item.Coverage.S);
      decompressed = await ungzip(Buffer.from(compressed, 'base64'));
    }
    else
    {
      decompressed = await ungzip(Buffer.from(item.Coverage.S, 'base64'));
    }

    batch.coverage = JSON.parse(decompressed.toString());
  }

  return batch;
}

function makeBoolean(item, field)
{
  if (item[field] !== undefined)
  {
    return item[field].S === 'true';
  }

  return false;
}

/**
 * Makes a user from a DynamoDB item
 */
function makeUser(item) {
  var user = {
    userId: item.UserId.S,
    firstName: item.FirstName.S,
    lastName: item.LastName.S,
    emailAddress: item.EmailAddress.S,
    enabled: item.UserEnabled.S === 'true',
    userRole: item.UserRole.S
  };

  return user;
}

/**
 * Makes a state item from a DynamoDB item
 */
function makeStateItem(item) {
  var stateItem = {
    contactId: item.ContactId.S,
    what: item.What.S,
    value: item.Value.S,
    expiry: item.Expiry.N
  };

  return stateItem;
}

/**
 * Makes a config item
 */
function makeConfigItem(item) {
  var configItem = {
    configKey: item.ConfigKey.S,
    configData: item.ConfigData.S,
    lastUpdate: moment(item.LastUpdate.S)
  };

  return configItem;
}

/**
 * Gives an ISO string `days` behind the current date
 * @param days: how many days behind
 * @returns {string}: ISOString representation of (now - days) date
 */
const nDaysBehindDateString = (days) => {
  const current = moment()
  const past = current.subtract(days, 'days')
  return past.utc().format('YYYY-MM-DDTHH:mm:ss.SSSZ')
}

/**
 * Update a weight into a rule
 */
 module.exports.updateWeight = async (rulesTable, ruleSetId, ruleId,weightId, field,operation,value,weight) =>
 {
    try
    {
       //Get weights from ruleId
       var rule = await module.exports.getRule(rulesTable, ruleSetId, ruleId);
       var existingWeight = rule.weights.find(weight => weight.weightId === weightId);
       if(existingWeight===undefined){
         throw new Error('Weight not found');
       }else{
         existingWeight.field=field;
         existingWeight.operation=operation;
         existingWeight.value=value;
         existingWeight.weight=weight;
         var statement = `UPDATE "${rulesTable}"` +
            ` SET "Weights" = ?` +
            ` WHERE "RuleSetId" = ?` +
            ` AND "RuleId" = ?`;

         var request = {
           Statement: statement,
           Parameters: [
             {
               S: JSON.stringify(rule.weights)
             },
             {
               S: ruleSetId
             },
             {
               S: ruleId
             }
           ]
         };
         //Update weight in database
         await dynamo.executeStatement(request).promise();
       }

     }
     catch (error)
     {
       console.log('[ERROR] failed to update weight into rule in Dynamo', error);
       throw error;
     }
 };
/**
 * Inserts a callback into DynamoDB
 */
module.exports.insertCallback = async (callbackTable, phoneNumber, queueArn) => {
  try {

    var timestamp = moment().utc().format();
    var expiryTimestamp = moment().utc().add(+process.env.CALLBACK_EXPIRY_HOURS, 'hours').format();

    var expiry = Math.floor(new Date().getTime() / 1000) + process.env.CALLBACK_EXPIRY_HOURS * 60 * 60;

    var request = {
      TableName: callbackTable,
      Item: {
        PhoneNumber: {
          S: phoneNumber
        },
        QueueArn: {
          S: queueArn
        },
        Timestamp: {
          S: timestamp
        },
        ExpiryTimestamp: {
          S: expiryTimestamp
        },
        Expiry: {
          N: '' + expiry
        }
      }
    };

    await dynamo.putItem(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to insert callback into Dynamo', error);
    throw error;
  }
};

/**
 * Deletes a callback from DynamoDB
 */
module.exports.deleteCallback = async (callbackTable, phoneNumber, queueArn) => {
  try {
    var statement = `DELETE FROM "${callbackTable}" WHERE "PhoneNumber" = ? AND "QueueArn" = ?`

    var request = {
      Statement: statement,
      Parameters: [
        {
          S: phoneNumber,

        },
        {
          S: queueArn,

        }
      ]
    };

    await dynamo.executeStatement(request).promise();
  }
  catch (error) {
    console.log('[ERROR] failed to delete callback from Dynamo', error);
    throw error;
  }
};

/**
 * Checks if a phone number is in a callback queue
 */
module.exports.phoneNumberInAnyCallbackQueue = async (callbackTable, phoneNumber) => {
  try {

    var now = moment().utc().format();

    var statement = `SELECT * FROM "${callbackTable}"` +
      ` WHERE "PhoneNumber" = ? AND "ExpiryTimestamp" > ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: phoneNumber
        },
        {
          S: now
        }
      ]
    };

    var results = await dynamo.executeStatement(request).promise();

    return results.Items && results.Items.length > 0;
  }
  catch (error) {
    console.log('[ERROR] failed to query for callback in Dynamo by phone number', error);
    throw error;
  }
};

/**
 * Fetches number of callbacks in a given queue
 */
module.exports.getCallbackCountByQueue = async (callbackTable, queueArn) => {
  try {

    var now = moment().utc().format();

    var statement = `SELECT * FROM "${callbackTable}"` +
      ` WHERE "QueueArn" = ? AND "ExpiryTimestamp" > ?`;

    var request = {
      Statement: statement,
      ConsistentRead: true,
      Parameters: [
        {
          S: queueArn
        },
        {
          S: now
        }
      ]
    };

    var results = await executeWithPagination(request);

    return results ? results.length : 0;
  }
  catch (error) {
    console.log('[ERROR] failed to query for callback in Dynamo by queue', error);
    throw error;
  }
};

/**
 * Executes a Dynamo executeStatement with pagination
 */
async function executeWithPagination(request) {

  var items = [];

  var nextToken = 'firstRun';

  /**
   * Keep scanning while we have more results
   */
  while (nextToken !== undefined) {

    var results = await dynamo.executeStatement(request).promise();

    request.NextToken = nextToken = results.NextToken;

    results.Items.forEach(item => {
      items.push(item);
    });
  }

  return items;
}
