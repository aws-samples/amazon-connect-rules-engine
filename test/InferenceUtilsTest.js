// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
const expect = require('chai').expect;
var inferenceUtils = require('../lambda/utils/InferenceUtils');

/**
 * InferenceUtils tests
 */
describe('InferenceUtilsTests', function()
{
  this.beforeAll(function()
  {
  });

  this.afterAll(function()
  {
  });

  // Tests isNumber function
  it('InferenceUtils.isNumber() tests', async function()
  {
    expect(inferenceUtils.isNumber(undefined)).to.equal(false);
    expect(inferenceUtils.isNumber(null)).to.equal(false);
    expect(inferenceUtils.isNumber('')).to.equal(false);
    expect(inferenceUtils.isNumber(false)).to.equal(false);
    expect(inferenceUtils.isNumber(true)).to.equal(false);
    expect(inferenceUtils.isNumber(' ')).to.equal(false);
    expect(inferenceUtils.isNumber('test')).to.equal(false);
    expect(inferenceUtils.isNumber('number')).to.equal(false);
    expect(inferenceUtils.isNumber(5.0)).to.equal(true);
    expect(inferenceUtils.isNumber('5')).to.equal(true);
    expect(inferenceUtils.isNumber('-5')).to.equal(true);
    expect(inferenceUtils.isNumber('0')).to.equal(true);
    expect(inferenceUtils.isNumber(0)).to.equal(true);
  });

  // Tests isNullOrUndefined function
  it('InferenceUtils.isNullOrUndefined() tests', async function()
  {
    expect(inferenceUtils.isNullOrUndefined(undefined)).to.equal(true);
    expect(inferenceUtils.isNullOrUndefined(null)).to.equal(true);
    expect(inferenceUtils.isNullOrUndefined(false)).to.equal(false);
    expect(inferenceUtils.isNullOrUndefined(true)).to.equal(false);
    expect(inferenceUtils.isNullOrUndefined('null')).to.equal(true);
    expect(inferenceUtils.isNullOrUndefined('undefined')).to.equal(true);
    expect(inferenceUtils.isNullOrUndefined('')).to.equal(false);
    expect(inferenceUtils.isNullOrUndefined('   ')).to.equal(false);
    expect(inferenceUtils.isNullOrUndefined('foo')).to.equal(false);
    expect(inferenceUtils.isNullOrUndefined(0)).to.equal(false);
    expect(inferenceUtils.isNullOrUndefined(1)).to.equal(false);
    expect(inferenceUtils.isNullOrUndefined(5.0)).to.equal(false);
    expect(inferenceUtils.isNullOrUndefined('5')).to.equal(false);
    expect(inferenceUtils.isNullOrUndefined('-5')).to.equal(false);
    expect(inferenceUtils.isNullOrUndefined('0')).to.equal(false);
  });

  // Tests isEmptyString function
  it('InferenceUtils.isEmptyString() tests', async function()
  {
    expect(inferenceUtils.isEmptyString(undefined)).to.equal(true);
    expect(inferenceUtils.isEmptyString(null)).to.equal(true);
    expect(inferenceUtils.isEmptyString(false)).to.equal(false);
    expect(inferenceUtils.isEmptyString(true)).to.equal(false);
    expect(inferenceUtils.isEmptyString('null')).to.equal(false);
    expect(inferenceUtils.isEmptyString('undefined')).to.equal(false);
    expect(inferenceUtils.isEmptyString('')).to.equal(true);
    expect(inferenceUtils.isEmptyString('   ')).to.equal(false);
    expect(inferenceUtils.isEmptyString('foo')).to.equal(false);
    expect(inferenceUtils.isEmptyString(0)).to.equal(false);
    expect(inferenceUtils.isEmptyString(1)).to.equal(false);
    expect(inferenceUtils.isEmptyString(5.0)).to.equal(false);
    expect(inferenceUtils.isEmptyString('5')).to.equal(false);
    expect(inferenceUtils.isEmptyString('-5')).to.equal(false);
    expect(inferenceUtils.isEmptyString('0')).to.equal(false);
  });

});
