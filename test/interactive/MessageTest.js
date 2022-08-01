// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

"use strict";
var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const messageInteractive = rewire('../../lambda/interactive/Message.js');

/**
 * Interactive tests for Message
 */
describe('MessageTests', function()
{
  this.beforeAll(function () {
      interactiveConfig.loadEnv();
  });

  it('Message.execute() should succeed', async function() {

    var context = makeTestContext();

    var response = await messageInteractive.execute(context);

    expect(response.message).to.equal('This is the biz, so cool.');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My message rule');
    expect(response.ruleType).to.equal('Message');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(0);
  });

  it('Message.execute() should fail for invalid context', async function() {

    var context = {
      customerState: {}
    };

    try
    {
      var response = await messageInteractive.execute(context);
      fail('Message should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('Message.execute() missing required config');
    }
  });


  it('Message.input() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await messageInteractive.input(context);
      fail('Message should not implement input()');
    }
    catch (error)
    {
      expect(error.message).to.equal('Message.input() is not implemented');
    }
  });

  it('Message.confirm() should fail', async function() {

    var context = makeTestContext();

    try
    {
      var response = await messageInteractive.confirm(context);
      fail('Message should not implement confirm()');
    }
    catch (error)
    {
      expect(error.message).to.equal('Message.confirm() is not implemented');
    }
  });

});

/**
 * Makes a test context
 */
function makeTestContext()
{
  return {
    requestMessage: {
      contactId: 'test',
      generateVoice: false
    },
    currentRuleSet: {
      name: 'My test rule set'
    },
    currentRule: {
      name: 'My message rule',
      type: 'Message',
      params: {
        message: 'This is the biz, so cool. XXX'
      }
    },
    customerState: {
      CurrentRule_message: 'This is the biz, so cool.'
    },
    stateToSave: new Set()
  };
}
