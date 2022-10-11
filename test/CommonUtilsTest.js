// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
const expect = require('chai').expect;
var commonUtils = require('../lambda/utils/CommonUtils');

/**
 * CommonUtils tests
 */
describe('CommonUtilsTests', function()
{
  this.beforeAll(function()
  {
  });

  this.afterAll(function()
  {
  });

  // Tests isNumber function
  it('CommonUtils.isNumber() tests', async function()
  {
    expect(commonUtils.isNumber(undefined)).to.equal(false);
    expect(commonUtils.isNumber(null)).to.equal(false);
    expect(commonUtils.isNumber('')).to.equal(false);
    expect(commonUtils.isNumber(false)).to.equal(false);
    expect(commonUtils.isNumber(true)).to.equal(false);
    expect(commonUtils.isNumber(' ')).to.equal(false);
    expect(commonUtils.isNumber('test')).to.equal(false);
    expect(commonUtils.isNumber('number')).to.equal(false);
    expect(commonUtils.isNumber(5.0)).to.equal(true);
    expect(commonUtils.isNumber(2)).to.equal(true);
    expect(commonUtils.isNumber('5')).to.equal(true);
    expect(commonUtils.isNumber('-5')).to.equal(true);
    expect(commonUtils.isNumber('0')).to.equal(true);
    expect(commonUtils.isNumber(0)).to.equal(true);
  });

  // Tests isNullOrUndefined function
  it('CommonUtils.isNullOrUndefined() tests', async function()
  {
    expect(commonUtils.isNullOrUndefined(undefined)).to.equal(true);
    expect(commonUtils.isNullOrUndefined(null)).to.equal(true);
    expect(commonUtils.isNullOrUndefined(false)).to.equal(false);
    expect(commonUtils.isNullOrUndefined(true)).to.equal(false);
    expect(commonUtils.isNullOrUndefined('null')).to.equal(true);
    expect(commonUtils.isNullOrUndefined('undefined')).to.equal(true);
    expect(commonUtils.isNullOrUndefined('')).to.equal(false);
    expect(commonUtils.isNullOrUndefined('   ')).to.equal(false);
    expect(commonUtils.isNullOrUndefined('foo')).to.equal(false);
    expect(commonUtils.isNullOrUndefined(0)).to.equal(false);
    expect(commonUtils.isNullOrUndefined(1)).to.equal(false);
    expect(commonUtils.isNullOrUndefined(5.0)).to.equal(false);
    expect(commonUtils.isNullOrUndefined('5')).to.equal(false);
    expect(commonUtils.isNullOrUndefined('-5')).to.equal(false);
    expect(commonUtils.isNullOrUndefined('0')).to.equal(false);
  });

  // Tests isEmptyString function
  it('CommonUtils.isEmptyString() tests', async function()
  {
    expect(commonUtils.isEmptyString(undefined)).to.equal(true);
    expect(commonUtils.isEmptyString(null)).to.equal(true);
    expect(commonUtils.isEmptyString(false)).to.equal(false);
    expect(commonUtils.isEmptyString(true)).to.equal(false);
    expect(commonUtils.isEmptyString('null')).to.equal(false);
    expect(commonUtils.isEmptyString('undefined')).to.equal(false);
    expect(commonUtils.isEmptyString('')).to.equal(true);
    expect(commonUtils.isEmptyString('   ')).to.equal(false);
    expect(commonUtils.isEmptyString('foo')).to.equal(false);
    expect(commonUtils.isEmptyString(0)).to.equal(false);
    expect(commonUtils.isEmptyString(1)).to.equal(false);
    expect(commonUtils.isEmptyString(5.0)).to.equal(false);
    expect(commonUtils.isEmptyString('5')).to.equal(false);
    expect(commonUtils.isEmptyString('-5')).to.equal(false);
    expect(commonUtils.isEmptyString('0')).to.equal(false);
  });

  it('ComonUtils.sleep() tests', async function()
  {
    await commonUtils.sleep(100);
  });

  it('ComonUtils.nowUTCMillis() tests', async function()
  {
    var ts = commonUtils.nowUTCMillis();
    console.info(ts);
    expect(ts.length).to.equal(29);
    expect(ts.endsWith('+00:00')).to.equal(true);
  });

  it('CommonUtils.clone() tests', async function()
  {
    var foo = {
      sneh: 'bar'
    };
    expect(foo.sneh).to.equal('bar');
    var clone = commonUtils.clone(foo);
    clone.sneh = 2;
    expect(foo.sneh).to.equal('bar');
  });

  it('CommonUtils.safelyMergePrompts() tests', async function()
  {
    var merged = commonUtils.safelyMergePrompts(['prompt1', 'prompt2']);

    expect(merged).to.equal('prompt1\nprompt2');

    merged = commonUtils.safelyMergePrompts(['<speak>prompt1</speak>', 'prompt2']);

    expect(merged).to.equal('<speak>\nprompt1\nprompt2\n</speak>');

    merged = commonUtils.safelyMergePrompts(['prompt1', ' <speak> prompt2 </speak> ']);

    expect(merged).to.equal('<speak>\nprompt1\nprompt2\n</speak>');

    merged = commonUtils.safelyMergePrompts(['<speak>Hey<break time="5s"/>there</speak>', ' <speak> prompt2 </speak> ']);

    expect(merged).to.equal('<speak>\nHey<break time="5s"/>there\nprompt2\n</speak>');

  });

});
