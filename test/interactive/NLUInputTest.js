// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const expect = require('chai').expect;
const sinon = require('sinon');
const AWSMock = require('aws-sdk-mock');
const interactiveConfig = require('./InteractiveConfig');
const lexRuntimeV2Mocker = require('../utils/LexRuntimeV2Mocker');
const nluInputInteractive = require('../../lambda/interactive/NLUInput');
const configUtils = require('../../lambda/utils/ConfigUtils');
const lexUtils = require('../../lambda/utils/LexUtils');

/**
 * Interactive tests for NLUInput
 */
describe('InteractiveNLUInputTests', function()
{
  this.beforeAll(function () {
    interactiveConfig.loadEnv();

    // Mock lex bot interactions
    lexRuntimeV2Mocker.setupMockLexRuntimeV2(AWSMock, lexUtils);

    var getLexBots = sinon.fake.returns([
      {
        "Name": "unittesting-rules-engine-date",
        "SimpleName": "date",
        "Arn": "arn:aws:lex:ap-southeast-2:55555555:bot-alias/A9EYOXQ8FF/E8SEC9JHHC",
        "Id": "A9EYOXQ8FF",
        "LocaleId": "en_AU",
        "AliasId": "E8SEC9JHHC"
      },
      {
        "Name": "unittesting-rules-engine-yesno",
        "SimpleName": "yesno",
        "Arn": "arn:aws:lex:ap-southeast-2:55555555:bot-alias/A9EYOXQ8TT/E8SEC9JHLP",
        "Id": "A9EYOXQ8TT",
        "LocaleId": "en_AU",
        "AliasId": "E8SEC9JHLP"
      }
    ]);

    sinon.replace(configUtils, 'getLexBots', getLexBots);
  });

  this.afterAll(function()
  {
    sinon.restore();
    AWSMock.restore('LexRuntimeV2');
  });

  it('NLUInput.execute() should succeed', async function()
  {
    var context = makeTestContext();

    var response = await nluInputInteractive.execute(context);

    expect(response.message).to.equal('For security purposes, please tell me your date of birth.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('input');
  });

  it('NLUInput.execute() should fail for invalid context', async function()
  {
    var context = {
    };

    try
    {
      var response = await nluInputInteractive.execute(context);
      throw new Error('NLUInput should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput has invalid configuration');
    }
  });

  it('NLUInput.execute() invalid auto confirm config', async function()
  {
    var context = makeTestContext();

    context.customerState.CurrentRule_autoConfirm = 'true';
    context.customerState.CurrentRule_autoConfirmMessage = undefined;

    try
    {
      var response = await nluInputInteractive.execute(context);
      throw new Error('Should have failed already due to invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput auto confirm is enabled but an auto confirm message was not provided');
    }
  });

  it('NLUInput.execute() should fail for invalid error config', async function()
  {
    var context = makeTestContext();

    context.customerState.CurrentRule_inputCount = '2';
    context.customerState.CurrentRule_errorMessage2 = undefined;
    context.customerState.CurrentRule_errorMessage3 = undefined;

    try
    {
      var response = await nluInputInteractive.execute(context);
      throw new Error('NLUInput should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput is missing required error message 2');
    }

    context.customerState.CurrentRule_inputCount = '0';

    try
    {
      var response = await nluInputInteractive.execute(context);
      throw new Error('Should fail with an invalid input count');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput input count must be between 1 and 3');
    }

    context.customerState.CurrentRule_inputCount = '2 a';

    try
    {
      var response = await nluInputInteractive.execute(context);
      throw new Error('Should fail with an invalid input count');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput input count must be a number');
    }

    context.customerState.CurrentRule_inputCount = '1';
    context.customerState.CurrentRule_errorCount = '3 a';

    try
    {
      var response = await nluInputInteractive.execute(context);
      throw new Error('Should fail with an invalid error count');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput error count must be a number');
    }

    context.customerState.CurrentRule_errorCount = '1';
    context.customerState.CurrentRule_autoConfirmConfidence = 'bletch';

    try
    {
      var response = await nluInputInteractive.execute(context);
      throw new Error('Should fail with an invalid confidence');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput auto confirm confidence must be a number between 0.0 and 1.0');
    }

    context.customerState.CurrentRule_autoConfirmConfidence = '2.0';

    try
    {
      var response = await nluInputInteractive.execute(context);
      throw new Error('Should fail with an invalid confidence');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput auto confirm confidence must be a number between 0.0 and 1.0');
    }
  });

  it('NLUInput.execute() should fail for invalid error config', async function()
  {
    var context = makeTestContext();

    context.customerState.CurrentRule_inputCount = '3';
    context.customerState.CurrentRule_errorMessage3 = undefined;

    try
    {
      var response = await nluInputInteractive.execute(context);
      throw new Error('NLUInput should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput is missing required error message 3');
    }
  });

  it('NLUInput.input() input "15th September 2017" with autoconfirm', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = '15th September 2017';

    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_autoConfirm = 'true';
    context.customerState.CurrentRule_autoConfirmMessage = 'I got your date of birth as the {{dateHuman OutputStateKey}}!';
    context.customerState.CurrentRule_autoConfirmConfidence = '0.5';

    var response = await nluInputInteractive.input(context);

    expect(response.message).to.equal('I got your date of birth as the 15th of September, 2017!');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(5);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('OutputStateKey')).to.equal(true);
    expect(context.customerState.OutputStateKey).to.equal('2017-09-15');

    expect(context.stateToSave.has('CurrentRule_slotValue')).to.equal(true);
    expect(context.customerState.CurrentRule_slotValue).to.equal('2017-09-15');

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUInputSlot).to.equal('2017-09-15');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');
  });

  it('NLUInput.input() should fail with missing lex bot', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = '15th September 2017';

    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_dataType = 'meh';
    context.customerState.CurrentRule_lexBotName = 'meh';
    context.customerState.CurrentRule_autoConfirm = 'true';
    context.customerState.CurrentRule_autoConfirmMessage = 'I got your date of birth as the {{dateHuman OutputStateKey}}!';
    context.customerState.CurrentRule_autoConfirmConfidence = '0.5';

    try
    {
      var response = await nluInputInteractive.input(context);
      throw new Error('NLUInput should fail with bad lex bot type');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput.findLexBot() could not find Lex bot: meh');
    }
  });

  it('NLUInput.input() input "15th September 2017" manual confirmation', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = '15th September 2017';

    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_confirmationMessage = 'I got your DOB as {{dateHuman OutputStateKey}}, cool?';
    context.customerState.CurrentRule_autoConfirm = 'false';
    context.customerState.CurrentRule_autoConfirmMessage = undefined;
    context.customerState.CurrentRule_autoConfirmConfidence = '0.5';

    var response = await nluInputInteractive.input(context);

    expect(response.message).to.equal('I got your DOB as 15th of September, 2017, cool?');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(5);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('OutputStateKey')).to.equal(true);
    expect(context.customerState.OutputStateKey).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_slotValue')).to.equal(true);
    expect(context.customerState.CurrentRule_slotValue).to.equal('2017-09-15');

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUInputSlot).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');
  });

  it('NLUInput.input() input "15th September 2017" low confidence', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = '15th September 2017';

    context.customerState.OutputStateKey = 'Bletch';
    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_confirmationMessage = 'I got your DOB as {{dateHuman OutputStateKey}}, cool?';
    context.customerState.CurrentRule_autoConfirm = 'true';
    context.customerState.CurrentRule_autoConfirmMessage = 'I got your date of birth as the {{dateHuman OutputStateKey}}!';
    context.customerState.CurrentRule_autoConfirmConfidence = '1.0';

    var response = await nluInputInteractive.input(context);

    expect(response.message).to.equal('I got your DOB as 15th of September, 2017, cool?');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(5);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('OutputStateKey')).to.equal(true);
    expect(context.customerState.OutputStateKey).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_slotValue')).to.equal(true);
    expect(context.customerState.CurrentRule_slotValue).to.equal('2017-09-15');

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUInputSlot).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');
  });

  it('NLUInput.input() undefined input', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = undefined;
    context.customerState.CurrentRule_phase = 'input';

    try
    {
      var response = await nluInputInteractive.input(context);
      throw new Error('NLUInput should fail with undefined input');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput.input() missing input');
    }
  });

  it('NLUInput.input() input "stuff" errorCount: 2 with errorRuleSetName', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'stuff';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_phase = 'input';

    var response = await nluInputInteractive.input(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(4);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('OutputStateKey')).to.equal(false);

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUInputSlot).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Error ruleset');
  });

  it('NLUInput.input() input "stuff" errorCount: 2 with no errorRuleSetName', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'stuff';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_inputCount = '3';
    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_errorRuleSetName = '';

    var response = await nluInputInteractive.input(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.terminate).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);
    expect(context.customerState.NextRuleSet).to.equal(undefined);

    expect(context.stateToSave.has('OutputStateKey')).to.equal(false);
    expect(context.customerState.OutputStateKey).to.equal(undefined);

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUInputSlot).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
  });

  it('NLUInput.input() input "stuff" errorCount: 2 with errorRuleSetName', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'stuff';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_phase = 'input';

    var response = await nluInputInteractive.input(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.terminate).to.equal(undefined);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(4);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Error ruleset');

    expect(context.stateToSave.has('OutputStateKey')).to.equal(false);
    expect(context.customerState.OutputStateKey).to.equal(undefined);

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUInputSlot).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');
  });

  it('NLUInput.input() input "Dunno" to match nodata and no input rule set', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'Dunno';
    context.customerState.CurrentRule_phase = 'input';
    context.customerState.OutputStateKey = 'blerrggg';

    var response = await nluInputInteractive.input(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(undefined);
    expect(response.terminate).to.equal(undefined);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('No input ruleset');

    expect(context.stateToSave.has('OutputStateKey')).to.equal(true);
    expect(context.customerState.OutputStateKey).to.equal(undefined);

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUInputSlot).to.equal(undefined);

  });

  it('NLUInput.input() input "Dunno" to match nodata and missing input rule set', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'Dunno';
    context.customerState.CurrentRule_phase = 'input';
    context.customerState.OutputStateKey = 'blerrggg';
    context.customerState.CurrentRule_noInputRuleSetName = '';
    context.customerState.System.LastNLUInputSlot = 'blerrggg';

    var response = await nluInputInteractive.input(context);

    expect(response.message).to.equal('Please say your date of birth.\nFor security purposes, please tell me your date of birth.');
    expect(response.inputRequired).to.equal(true);
    expect(response.terminate).to.equal(undefined);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(4);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);
    expect(context.customerState.NextRuleSet).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

    expect(context.stateToSave.has('OutputStateKey')).to.equal(true);
    expect(context.customerState.OutputStateKey).to.equal(undefined);

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUInputSlot).to.equal(undefined);

  });

  it('NLUInput.input() should fail for invalid context', async function()
  {
    var context = {
    };

    try
    {
      var response = await nluInputInteractive.input(context);
      throw new Error('NLUInput should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput has invalid configuration');
    }
  });

  it('NLUInput.confirm() input "Yes"', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'Yes';
    context.customerState.CurrentRule_slotValue = '2017-09-15';
    context.customerState.CurrentRule_validInput = 'true';
    context.customerState.CurrentRule_errorCount = '1';
    context.customerState.CurrentRule_inputCount = '3';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_errorRuleSetName = '';

    var response = await nluInputInteractive.confirm(context);

    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);
    expect(context.customerState.NextRuleSet).to.equal(undefined);

    expect(context.stateToSave.has('OutputStateKey')).to.equal(true);
    expect(context.customerState.OutputStateKey).to.equal('2017-09-15');

    expect(context.stateToSave.has('System')).to.equal(true);
    expect(context.customerState.System.LastNLUInputSlot).to.equal('2017-09-15');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(false);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');
  });

  it('NLUInput.confirm() input "No"', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'No';
    context.customerState.CurrentRule_slotValue = '2017-09-15';
    context.customerState.CurrentRule_validInput = 'true';
    context.customerState.CurrentRule_errorCount = '1';
    context.customerState.CurrentRule_inputCount = '3';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_errorRuleSetName = '';

    var response = await nluInputInteractive.confirm(context);

    expect(response.message).to.equal('For security purposes, please tell me your date of birth.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(4);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);
    expect(context.customerState.NextRuleSet).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('2');

    expect(context.stateToSave.has('OutputStateKey')).to.equal(false);
    expect(context.customerState.OutputStateKey).to.equal(undefined);

    expect(context.stateToSave.has('System')).to.equal(false);
    expect(context.customerState.System.LastNLUInputSlot).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('2');
  });

  it('NLUInput.confirm() input "NOINPUT" at max errors with error rule set', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'NOINPUT';
    context.customerState.CurrentRule_slotValue = '2017-09-15';
    context.customerState.CurrentRule_validInput = 'true';
    context.customerState.CurrentRule_errorCount = '1';
    context.customerState.CurrentRule_inputCount = '2';
    context.customerState.CurrentRule_phase = 'confirm';

    var response = await nluInputInteractive.confirm(context);

    expect(response.message).to.equal('Just tell me your date of birth.');
    expect(response.inputRequired).to.equal(false);
    expect(response.terminate).to.equal(undefined);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Error ruleset');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('2');

    expect(context.stateToSave.has('OutputStateKey')).to.equal(false);
    expect(context.customerState.OutputStateKey).to.equal(undefined);

    expect(context.stateToSave.has('System')).to.equal(false);
    expect(context.customerState.System.LastNLUInputSlot).to.equal(undefined);
  });

  it('NLUInput.confirm() input "NOINPUT" at max errors with no error rule set', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'NOINPUT';
    context.customerState.CurrentRule_slotValue = '2017-09-15';
    context.customerState.CurrentRule_validInput = 'true';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_inputCount = '3';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_errorRuleSetName = '';

    var response = await nluInputInteractive.confirm(context);

    expect(response.message).to.equal('Sorry I couldn\'t understand you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.terminate).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My nluinput rule');
    expect(response.ruleType).to.equal('NLUInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    console.info('State to save: ' + Array.from(context.stateToSave).join(', '));

    expect(context.stateToSave.has('NextRuleSet')).to.equal(false);
    expect(context.customerState.NextRuleSet).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');

    expect(context.stateToSave.has('OutputStateKey')).to.equal(false);
    expect(context.customerState.OutputStateKey).to.equal(undefined);

    expect(context.stateToSave.has('System')).to.equal(false);
    expect(context.customerState.System.LastNLUInputSlot).to.equal(undefined);
  });

  it('NLUInput.confirm() should fail for invalid context', async function()
  {
    var context = {
    };

    try
    {
      var response = await nluInputInteractive.confirm(context);
      throw new Error('NLUInput should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput has invalid configuration');
    }
  });

  it('NLUInput.confirm() should fail for missing input', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = undefined;
    context.customerState.CurrentRule_slotValue = '2017-09-15';

    try
    {
      var response = await nluInputInteractive.confirm(context);
      throw new Error('NLUInput should fail with missing input');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput.confirm() missing required parameters');
    }
  });

  it('NLUInput.confirm() should fail for missing slot value', async function()
  {
    var context = makeTestContext();

    context.requestMessage.input = 'sneh';
    context.customerState.CurrentRule_slotValue = undefined;

    try
    {
      var response = await nluInputInteractive.confirm(context);
      throw new Error('NLUInput should fail with missing slotValue');
    }
    catch (error)
    {
      expect(error.message).to.equal('NLUInput.confirm() missing required parameters');
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
      name: 'My nluinput rule',
      type: 'NLUInput',
      params: {
      }
    },
    customerState: {
      CurrentRule_offerMessage: 'For security purposes, please tell me your date of birth.',
      CurrentRule_errorCount: '0',
      CurrentRule_autoConfirmConfidence: '0.5',
      CurrentRule_errorRuleSetName: 'Error ruleset',
      CurrentRule_noInputRuleSetName: 'No input ruleset',
      CurrentRule_dataType: 'date',
      CurrentRule_lexBotName: 'date',
      CurrentRule_inputCount: '3',
      CurrentRule_outputStateKey: 'OutputStateKey',
      CurrentRule_errorMessage1: 'Please say your date of birth.',
      CurrentRule_errorMessage2: 'Just tell me your date of birth.',
      CurrentRule_errorMessage3: 'Sorry I couldn\'t understand you.',
      System: {}
    },
    stateToSave: new Set()
  };
}
