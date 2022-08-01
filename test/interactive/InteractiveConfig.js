// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

"use strict";

const loadEnv = function () {
    process.env['VALID_ORIGINS'] = '["https://unit-testing-aws.cloudfront.net"]';
    process.env['USERS_TABLE'] = `${process.env.stage}-${process.env.service}-users-ddb`;
    process.env['RULE_SETS_TABLE'] = `${process.env.stage}-${process.env.service}-rule-sets-ddb`;
    process.env['RULES_TABLE'] = `${process.env.stage}-${process.env.service}-rules-ddb`;
    process.env['CONFIG_TABLE'] = `${process.env.stage}-${process.env.service}-config-ddb`;
    process.env['STATE_TABLE'] = `${process.env.stage}-${process.env.service}-state-ddb`;
    process.env['TESTS_TABLE'] = `${process.env.stage}-${process.env.service}-tests-ddb`;
    process.env['CALLBACK_TABLE'] = `${process.env.stage}-${process.env.service}-callback-ddb`;
    process.env['INSTANCE_ID'] = `${process.env.instanceId}`;
    process.env['REGION'] = `${process.env.region}`;
    process.env['ACCOUNT_NUMBER'] = `${process.env.accountNumber}`;
    process.env['CLOUDWATCH_NAMESPACE'] = `${process.env.service}`;

    // console.info(`Made environment: ` + JSON.stringify(process.env, null, 2));
}

module.exports = { loadEnv }
