// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
var moment = require('moment-timezone');
const expect = require("chai").expect;
const config = require('./utils/config.js')
const AWSMock = require('aws-sdk-mock');

const rulesEngine = rewire('../lambda/utils/RulesEngine.js')
//need to fix these test cases
const template = rulesEngine.__get__('template')
const testRule = rulesEngine.__get__('testRule')

//working test cases
const getIgnoredTemplateFields = rulesEngine.__get__('getIgnoredTemplateFields')
const weightEquals = rulesEngine.__get__('weightEquals')
const weightIsNull = rulesEngine.__get__('weightIsNull')
const weightIsNotNull = rulesEngine.__get__('weightIsNotNull')
const weightIsMobile = rulesEngine.__get__('weightIsMobile')
const weightIsEmpty = rulesEngine.__get__('weightIsEmpty')
const weightIsNotMobile = rulesEngine.__get__('weightIsNotMobile')
const weightLessThan = rulesEngine.__get__('weightLessThan')
const weightGreaterThan = rulesEngine.__get__('weightGreaterThan')
const weightContains = rulesEngine.__get__('weightContains')
const weightStartsWith = rulesEngine.__get__('weightStartsWith')
const weightEndsWith = rulesEngine.__get__('weightEndsWith')

var weight = {
    "weightId": "bcb99178-670f-41ef-aacc-bd1d1ea3e72f",
    "field":"SN_SEGMENT",
    "operation":"equals",
    "value":"BUSINESS",
    "weight":"100"
}

var rule = {
    "rule": {
        "ruleSetId": "f5047623-6f64-4da6-ac28-8c03d2abbc35",
        "ruleId": "4c5f1745-9db8-40e8-bcc3-8115cb1ffbcf",
        "name": "0001 - Play welcome",
        "description": "",
        "priority": "0",
        "activation": "0",
        "type": "Message",
        "enabled": true,
        "params": {
            "message": "Hello"
        },
        "weight": [{
            "weightId": "bcb99178-670f-41ef-aacc-bd1d1ea3e72f",
            "field": "SN_SEGMENT",
            "operation": "equals",
            "value": "BUSINESS",
            "weight": "100"
        }],
        "productionReady": false
    }
}


describe('RulesEngine Function tests', async function () {
    this.beforeAll(function () {
    config.loadEnv()
    });

    it('getIgnoredTemplateFields() should return non null', async function () {
        var ignored = getIgnoredTemplateFields()

        expect(ignored).to.not.equal(undefined)
    });

    //not entirely working (not sure what "ignoredfields" should be)
    /*it("template() should return a rule template", async function () {
        var ruletemp = template(rule,{ "SN_SEGMENT": "BUSINESS" }, getIgnoredTemplateFields())
        expect(ruletemp).to.not.equal(undefined)
    })*/

    //foreach statement is not working inside rule.weight
    /*it('testRule() should return non null', async function () {
        var test = testRule({ "SN_SEGMENT": "BUSINESS" }, rule)

        expect(test).to.not.equal(undefined)
        expect(test).to.equal(""+100)
    });*/

    it('getRawValue()', async function () {
        var raw = rulesEngine.getRawValue(weight,  { "SN_SEGMENT": "BUSINESS" })

        expect(raw).to.not.equal(undefined)
        expect(raw).to.equal("BUSINESS")
    });

    it('evaluateWeight()', async function () {

        console.log("Testing case equals")
        var getRaw = rulesEngine.evaluateWeight(weight, "BUSINESS")
        expect(getRaw).to.not.equal(undefined)
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case notequals")
        weight.operation = "notequals"
        getRaw = rulesEngine.evaluateWeight(weight, "BUSINESS")
        expect(getRaw).to.equal(false)

        console.log("Testing case isempty")
        weight.operation = "isempty"
        getRaw = rulesEngine.evaluateWeight(weight, "BUSINESS")
        expect(getRaw).to.equal(0)

        console.log("Testing case isnotempty")
        weight.operation = "isnotempty"
        getRaw = rulesEngine.evaluateWeight(weight, "BUSINESS")
        expect(getRaw).to.equal(true)

        console.log("Testing case isnull")
        weight.operation = "isnull"
        getRaw = rulesEngine.evaluateWeight(weight, "BUSINESS")
        expect(getRaw).to.equal(0)

        console.log("Testing case isnotnull")
        weight.operation = "isnotnull"
        getRaw = rulesEngine.evaluateWeight(weight, "BUSINESS")
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case ismobile")
        weight.operation = "ismobile"
        getRaw = rulesEngine.evaluateWeight(weight, "BUSINESS")
        expect(getRaw).to.equal(0)

        console.log("Testing case isnotmobile")
        weight.operation = "isnotmobile"
        getRaw = rulesEngine.evaluateWeight(weight, "BUSINESS")
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case lessthan")
        weight.operation = "lessthan"
        getRaw = rulesEngine.evaluateWeight(weight, "BUSINESS")
        expect(getRaw).to.equal(0)

        console.log("Testing case greaterthan")
        weight.operation = "greaterthan"
        getRaw = rulesEngine.evaluateWeight(weight, "BUSINESS")
        expect(getRaw).to.equal(0)

        // contains

        console.log("Testing case contains (string, true)")
        weight.operation = "contains"
        getRaw = rulesEngine.evaluateWeight(weight, "IMPORTANT_BUSINESS_STOOF")
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case contains (string, false)")
        weight.operation = "contains"
        getRaw = rulesEngine.evaluateWeight(weight, "IMPORTANT_STOOF")
        expect(getRaw).to.equal(0)

        console.log("Testing case contains (array, true)")
        weight.operation = "contains"
        getRaw = rulesEngine.evaluateWeight(weight, ["IMPORTANT", "BUSINESS", "STOOF"])
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case contains (array, false)")
        weight.operation = "contains"
        getRaw = rulesEngine.evaluateWeight(weight, ["IMPORTANT", "STOOF"])
        expect(getRaw).to.equal(0)

        console.log("Testing case contains (undefined, false)")
        weight.operation = "contains"
        getRaw = rulesEngine.evaluateWeight(weight, undefined)
        expect(getRaw).to.equal(0)

        // notcontains

        console.log("Testing case notcontains (string, false)")
        weight.operation = "notcontains"
        getRaw = rulesEngine.evaluateWeight(weight, "IMPORTANT_BUSINESS_STOOF")
        expect(getRaw).to.equal(0)

        console.log("Testing case notcontains (string, true)")
        weight.operation = "notcontains"
        getRaw = rulesEngine.evaluateWeight(weight, "IMPORTANT_STOOF")
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case notcontains (array, false)")
        weight.operation = "notcontains"
        getRaw = rulesEngine.evaluateWeight(weight, ["IMPORTANT", "BUSINESS", "STOOF"])
        expect(getRaw).to.equal(0)

        console.log("Testing case notcontains (array, true)")
        weight.operation = "notcontains"
        getRaw = rulesEngine.evaluateWeight(weight, ["IMPORTANT", "STOOF"])
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case notcontains (undefined, true)")
        weight.operation = "notcontains"
        getRaw = rulesEngine.evaluateWeight(weight, undefined)
        expect(getRaw).to.equal(+weight.weight)

        // startswith

        console.log("Testing case startswith (string, true)")
        weight.operation = "startswith"
        getRaw = rulesEngine.evaluateWeight(weight, 'BUSINESS_STOOF');
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case startswith (string, false)")
        weight.operation = "startswith"
        getRaw = rulesEngine.evaluateWeight(weight, 'STOOF_BUSINESS');
        expect(getRaw).to.equal(0)

        console.log("Testing case startswith (array, false)")
        weight.operation = "startswith"
        getRaw = rulesEngine.evaluateWeight(weight, ['BUSINESS_STOOF']);
        expect(getRaw).to.equal(0)

        console.log("Testing case startswith (object, false)")
        weight.operation = "startswith"
        getRaw = rulesEngine.evaluateWeight(weight, {thing: 'BUSINESS_STOOF'});
        expect(getRaw).to.equal(0)

        console.log("Testing case startswith (undefined, false)")
        weight.operation = "startswith"
        getRaw = rulesEngine.evaluateWeight(weight, undefined);
        expect(getRaw).to.equal(0)

        // notstartswith

        console.log("Testing case notstartswith (string, false)")
        weight.operation = "notstartswith"
        getRaw = rulesEngine.evaluateWeight(weight, 'BUSINESS_STOOF');
        expect(getRaw).to.equal(0)

        console.log("Testing case notstartswith (string, true)")
        weight.operation = "notstartswith"
        getRaw = rulesEngine.evaluateWeight(weight, 'STOOF_BUSINESS');
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case notstartswith (array, true)")
        weight.operation = "notstartswith"
        getRaw = rulesEngine.evaluateWeight(weight, ['BUSINESS_STOOF']);
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case notstartswith (object, true)")
        weight.operation = "notstartswith"
        getRaw = rulesEngine.evaluateWeight(weight, {thing: 'BUSINESS_STOOF'});
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case notstartswith (undefined, true)")
        weight.operation = "notstartswith"
        getRaw = rulesEngine.evaluateWeight(weight, undefined);
        expect(getRaw).to.equal(+weight.weight)

        // endswith

        console.log("Testing case endswith (string, true)")
        weight.operation = "endswith"
        getRaw = rulesEngine.evaluateWeight(weight, 'STOOF_BUSINESS');
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case endswith (string, false)")
        weight.operation = "endswith"
        getRaw = rulesEngine.evaluateWeight(weight, 'BUSINESS_STOOF');
        expect(getRaw).to.equal(0)

        console.log("Testing case endswith (array, false)")
        weight.operation = "endswith"
        getRaw = rulesEngine.evaluateWeight(weight, ['STOOF_BUSINESS']);
        expect(getRaw).to.equal(0)

        console.log("Testing case endswith (object, false)")
        weight.operation = "endswith"
        getRaw = rulesEngine.evaluateWeight(weight, {thing: 'STOOF_BUSINESS'});
        expect(getRaw).to.equal(0)

        console.log("Testing case endswith (undefined, false)")
        weight.operation = "endswith"
        getRaw = rulesEngine.evaluateWeight(weight, undefined);
        expect(getRaw).to.equal(0)

        // notendswith

        console.log("Testing case notendswith (string, false)")
        weight.operation = "notendswith"
        getRaw = rulesEngine.evaluateWeight(weight, 'STOOF_BUSINESS');
        expect(getRaw).to.equal(0)

        console.log("Testing case notendswith (string, true)")
        weight.operation = "notendswith"
        getRaw = rulesEngine.evaluateWeight(weight, 'BUSINESS_STOOF');
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case notendswith (array, true)")
        weight.operation = "notendswith"
        getRaw = rulesEngine.evaluateWeight(weight, ['STOOF_BUSINESS']);
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case notendswith (object, true)")
        weight.operation = "notendswith"
        getRaw = rulesEngine.evaluateWeight(weight, {thing: 'STOOF_BUSINESS'});
        expect(getRaw).to.equal(+weight.weight)

        console.log("Testing case notendswith (undefined, true)")
        weight.operation = "notendswith"
        getRaw = rulesEngine.evaluateWeight(weight, undefined);
        expect(getRaw).to.equal(+weight.weight)

        /*console.log("Testing case default")
        weight.operation = "error"
        getRaw = evaluateWeight(weight, "BUSINESS")*/
    });

    it('resolveWeightValue()', async function () {
        var raw = rulesEngine.resolveWeightValue(weight,  { "SN_SEGMENT": "BUSINESS" })

        expect(raw).to.equal(undefined)
    });

    it('weightEquals() should return +weight.weight', async function () {
        var weightequal = weightEquals(weight, "BUSINESS" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(+weight.weight)
    });

    it('weightIsNull() should return +weight.weight', async function () {
        var weightequal = weightIsNull(weight, "BUSINESS" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)

        var weightequal = weightIsNull(weight, null )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(+weight.weight)

    });

    it('weightIsNotNull() should return +weight.weight', async function () {
        var weightequal = weightIsNotNull(weight, null )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)

        var weightequal = weightIsNotNull(weight, "BUSINESS" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(+weight.weight)

    });

    it('weightIsMobile() should return +weight.weight', async function () {
        var weightequal = weightIsMobile(weight, "BUSINESS" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)

        var weightequal = weightIsMobile(weight, "+61412345678" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(+weight.weight)

        var weightequal = weightIsMobile(weight, null )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)

    });

    it('weightIsEmpty() should return +weight.weight', async function () {
        var weightequal = weightIsEmpty(weight, "BUSINESS" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)

        var weightequal = weightIsEmpty(weight, "" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(+weight.weight)

    });

    it('weightIsNotMobile() should return +weight.weight', async function () {
        var weightequal = weightIsNotMobile(weight, "BUSINESS" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(+weight.weight)

        var weightequal = weightIsNotMobile(weight, "+61412345678" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)

        var weightequal = weightIsNotMobile(weight, null )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(+weight.weight)

    });

    it('weightLessThan() should return +weight.weight', async function () {
        var weightequal = weightLessThan(weight, "BUSINESS" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)

        var weightequal = weightLessThan(weight, "99" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(weight.weight)

        var weightequal = weightLessThan(weight, null )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)
    });

    it('weightLGreaterThan() should return +weight.weight', async function () {
        var weightequal = weightGreaterThan(weight, "BUSINESS" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)

        var weightequal = weightGreaterThan(weight, "101" )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)

        var weightequal = weightGreaterThan(weight, null )

        expect(weightequal).to.not.equal(undefined)
        expect(weightequal).to.equal(0)
    });

})
