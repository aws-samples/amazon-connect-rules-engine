// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

"use strict";

const loadEnv = function (env) {
    process.env['VALID_ORIGINS'] = '["https://unit-testing-aws.cloudfront.net"]';
    process.env['USERS_TABLE'] = "unittesting-rules-engine-users-ddb";
    process.env['RULE_SETS_TABLE'] = "unittesting-rules-engine-rule-sets-ddb";
    process.env['RULES_TABLE'] = "unittesting-rules-engine-rules-ddb";
    process.env['CONFIG_TABLE'] = "unittesting-rules-engine-config-ddb";
    process.env['STATE_TABLE'] = "unittesting-rules-engine-state-ddb";
    process.env['TESTS_TABLE'] = "unittesting-rules-engine-tests-ddb";
    process.env['CALLBACK_TABLE'] = "unittesting-rules-engine-callback-ddb";
    process.env['SERVICE'] = "rules-engine";
    process.env['STAGE'] = "unittesting";
}

module.exports = { loadEnv }
