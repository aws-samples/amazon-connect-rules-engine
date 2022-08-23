// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const expect = require('chai').expect;
const keepWarmUtils = require('../lambda/utils/KeepWarmUtils');

/**
 * KeepWarmUtils tests
 */
describe('KeepWarmUtilsTests', function()
{
  this.beforeAll(function()
  {
    keepWarmUtils.reset();
  });

  this.afterAll(function()
  {
    keepWarmUtils.reset();
  });

  // Tests creating a request
  it('KeepWarmUtils.createKeepWarmRequest()', async function()
  {
    var request = keepWarmUtils.createKeepWarmRequest('functionName', 'functionArn');

    var expected = {
      keepWarm: {
        name: 'functionName',
        arn: 'functionArn',
      }
    };

    expect(JSON.stringify(request)).to.equal(JSON.stringify(expected));
  });

  it('keepWarmUtils.isKeepWarmRequest()', async function()
  {
    var request = keepWarmUtils.createKeepWarmRequest('functionName', 'functionArn');

    expect(keepWarmUtils.isKeepWarmRequest(request)).to.equal(true);

    request = {};

    expect(keepWarmUtils.isKeepWarmRequest(request)).to.equal(false);
  });

  // Tests making a response
  it('KeepWarmUtils.makeKeepWarmResponse()', async function()
  {
    var request = keepWarmUtils.createKeepWarmRequest('functionName', 'functionArn');
    var response = await keepWarmUtils.makeKeepWarmResponse(request);
    expect(keepWarmUtils.isKeepWarmResponse(response)).to.equal(true);
    expect(response.keepWarm.coldStart).to.equal(true);

    response = await keepWarmUtils.makeKeepWarmResponse(request, 100);
    expect(keepWarmUtils.isKeepWarmResponse(response)).to.equal(true);
    expect(response.keepWarm.coldStart).to.equal(false);

    response = await keepWarmUtils.makeKeepWarmResponse(request, 0);
    expect(keepWarmUtils.isKeepWarmResponse(response)).to.equal(true);
    expect(response.keepWarm.coldStart).to.equal(false);

    expect(keepWarmUtils.isKeepWarmResponse({})).to.equal(false);
  });
});
