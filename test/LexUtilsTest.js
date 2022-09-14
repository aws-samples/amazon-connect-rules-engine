// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const expect = require('chai').expect;
var lexUtils = require('../lambda/utils/LexUtils');


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

  // Tests expanding a raw input transcript containing double and triple
  it('LexUtils.expandPhoneNumber()', async function()
  {
    var testData = [
      {
        input: '',
        output: undefined
      },
      {
        input: null,
        output: undefined
      },
      {
        input: undefined,
        output: undefined
      },
      {
        input: '0422529062',
        output: '0422529062'
      },
      {
        input: 'oh Four double 2 5 two nine zero six two',
        output: '0422529062'
      },
      {
        input: 'The lazy brown dog jumped over the big red hen',
        output: 'The lazy brown dog jumped over the big red hen'
      },
      {
        input: 'Zero 4 double two three seven triple five',
        output: '042237555'
      },
      {
        input: 'Zero 4 double two test seven triple five',
        output: 'Zero 4 double two test seven triple five'
      },
      {
        input: 'Plus sixty one double two seven triple five double eight',
        output: '+6122755588'
      },
      {
        input: 'Plus sixty seven three thousand double five triple two',
        output: '+67300055222'
      }
      ,
      {
        input: 'oh four double double one um three six err two four triple double four',
        output: '0411362444'
      }
    ];


    for (var i = 0; i < testData.length; i++)
    {
      expect(lexUtils.expandPhoneNumber(testData[i].input)).to.equal(testData[i].output);
    }
  });

});

