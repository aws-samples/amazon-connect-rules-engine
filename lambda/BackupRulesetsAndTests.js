// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const s3 = require('./utils/S3Utils');
const dynamoUtils = require('./utils/DynamoUtils');
const moment = require('moment');

/**
 * Backs up rule sets and tests
 */
exports.handler = async (event) =>
{
  const rulesets = await getRuleSetsToBackup();
  await uploadAndBackup(rulesets, process.env.BACKUP_BUCKET_NAME, 'ruleset-backup.json');

  const tests = await getTestsToBackup();
  await uploadAndBackup(tests, process.env.BACKUP_BUCKET_NAME, 'test-backup.json');

  console.info('Successfully backed up rule sets and tests');

  return {
    success: true
  };
};


/**
 * Fetches rule sets to backup
 */
const getRuleSetsToBackup = async () =>
{
  const ruleSets = await dynamoUtils.getRuleSetsAndRules(process.env.RULE_SETS_TABLE, process.env.RULES_TABLE);

  // Remove the rule set ids, rule ids and weight ids from the response
  ruleSets.forEach(ruleSet =>
  {
    ruleSet.ruleSetId = undefined;
    ruleSet.rules.forEach(rule =>
    {
      rule.ruleId = undefined;
      rule.ruleSetId = undefined;
      rule.weights.forEach(weight =>
      {
        weight.weightId = undefined;
      });
    });
  });

  return ruleSets;
};

/**
 * Fetches tests to backup
 */
const getTestsToBackup = async () =>
{
  const tests = await dynamoUtils.getTests(process.env.TESTS_TABLE);

  // Remove the test ids
  tests.forEach(test =>
  {
    test.testId = undefined;
  });

  var testExport = {
    type: 'RulesEngineTests',
    version: process.env.VERSION,
    environmentName: process.env.ENVIRONMENT_NAME,
    format: +process.env.TEST_EXPORT_FORMAT,
    exportedBy: 'scheduled export',
    exportedAt: moment().utc().format(),
    testCount: tests.length,
    tests: tests
  };

  return testExport;
};

/**
 * Upload data as JSON to S3
 */
const uploadAndBackup = async (data, bucketName, suffix) =>
{
  try
  {
    // Upload it to /year/month/day/[hour_of_day]-[suffix]
    const now = moment().utc();
    const year = now.year();
    const month = now.month() + 1;
    const day = now.date();
    const timeStamp = now.format('YYYY-MM-DD-THH-mm-ssZ');
    const key = `${year}/${month}/${day}/${timeStamp}-${suffix}`;

    console.info(`Backing up data to: s3://${bucketName}/${key}`);

    const params = {
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2)
    };
    await s3.upload(params).promise();
  }
  catch (error)
  {
    console.error('Failed to backup to S3', error);
    throw error;
  }
};
