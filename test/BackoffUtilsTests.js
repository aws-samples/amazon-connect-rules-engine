// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
const expect = require('chai').expect;
const config = require('./utils/config.js');
const backoffUtils = rewire('../lambda/utils/BackoffUtils.js');

var computeSleepTime = backoffUtils.__get__('computeSleepTime')

describe('BackoffUtilsTests', function() {
    this.timeout(60000);

    this.beforeAll(function () {
        config.loadEnv();
    });

    // Test computing sleep times to be within expected bounds
    it('computeSleepTime() should be bounded based on retry', function() {

      var maxTimes = [
        250,
        500,
        1000
      ];

      for (var i = 0; i < maxTimes.length; i++)
      {
        var sleep = computeSleepTime(i);
        expect(sleep).to.be.within(250, maxTimes[i]);
      }
    });

    // Tests actually backing off and sleeping
    it('backoff() should sleep', async function() {

      console.info('Testing backoff for various retry counts:');

      var error = new Error('Something on fire?');

      for (var i = 0; i < 3; i++)
      {
        try
        {
          await backoffUtils.backoff(`Retry: ${i}`, i, error);
        }
        catch (error)
        {
          throw new Error ("backoffUtils.backoff() should not fail", error);
        }
      }
    });


});
