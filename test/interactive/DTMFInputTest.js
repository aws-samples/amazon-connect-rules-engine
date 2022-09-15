// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
const expect = require('chai').expect;
const interactiveConfig = require('./InteractiveConfig.js');
const dtmfInputInteractive = rewire('../../lambda/interactive/DTMFInput.js');

/**
 * Interactive tests for DTMFInput
 */
describe('DTMFInputTests', function()
{
  this.beforeAll(function () {
    interactiveConfig.loadEnv();
  });

  /**
   * Test what happens with a vanilla execute
   */
  it('DTMFInput.execute() should succeed', async function() {

    var context = makeTestContext();

    var response = await dtmfInputInteractive.execute(context);

    expect(response.message).to.equal('Please enter your 4 digit pincode.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('input');
  });

  /**
   * Test execute() failure with invalid input
   */
  it('DTMFInput.execute() should fail with invalid context', async function()
  {
    var context = {
    };

    try
    {
      var response = await dtmfInputInteractive.execute(context);
      fail('DTMFInput should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('DTMFInput.execute() missing required config');
    }
  });

  /**
   * Test what happens when a user enters 5555 in the Number input phase
   */
  it('DTMFInput.input() Number "5555" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '5555';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You entered 5 5 5 5 is that correct? Press 1 to continue, press 2 to try again.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('CurrentRule_input')).to.equal(true);
    expect(context.customerState.CurrentRule_input).to.equal('5555');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

  });

  /**
   * Test what happens when a user enters 5555 in the Number input phase with a nested state key
   */
  it('DTMFInput.input() Number "5555" errorCount: 0 nested state key', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '5555';
    context.customerState.CurrentRule_phase = 'input';
    context.customerState.CurrentRule_outputStateKey = 'Customer.foo';
    context.customerState.CurrentRule_confirmationMessage = 'You entered {{characterSpeechFast Customer.foo}} is that correct? Press 1 to continue, press 2 to try again.';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You entered 5 5 5 5 is that correct? Press 1 to continue, press 2 to try again.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('CurrentRule_input')).to.equal(true);
    expect(context.customerState.CurrentRule_input).to.equal('5555');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

  });

  /**
   * Test what happens when a user enters 5555 in the input phase
   * phase with an exising error count of 1
   */
  it('DTMFInput.input() Number "5555" errorCount: 1', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '5555';
    context.customerState.CurrentRule_errorCount = '1';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You entered 5 5 5 5 is that correct? Press 1 to continue, press 2 to try again.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('CurrentRule_input')).to.equal(true);
    expect(context.customerState.CurrentRule_input).to.equal('5555');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

    // Should still have an error count of 1
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');
  });

  /**
   * Test what happens when a user enters a valid date in the Date input phase
   */
  it('DTMFInput.input() Date "25122022" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '25122022';
    context.customerState.CurrentRule_dataType = 'Date';
    context.currentRule.params.dataType = 'Date XXX';
    context.customerState.CurrentRule_confirmationMessage = 'You entered the {{dateOfBirthHuman SomeStateKey}} is that correct? Press 1 to continue, press 2 to try again.';
    context.currentRule.params.confirmationMessage = 'You entered the {{dateOfBirthHuman SomeStateKey}} is that correct? Press 1 to continue, press 2 to try again. XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You entered the 25th of December 2022 is that correct? Press 1 to continue, press 2 to try again.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('CurrentRule_input')).to.equal(true);
    expect(context.customerState.CurrentRule_input).to.equal('25122022');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

  });

  /**
   * Test what happens when a user enters an invalid date in the Date input phase
   */
  it('DTMFInput.input() Date "41122022" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '41122022';
    context.customerState.CurrentRule_dataType = 'Date';
    context.currentRule.params.dataType = 'Date XXX';
    context.currentRule.params.offerMessage = 'Please enter your date of birth using your phone\'s keypad. XXX';
    context.customerState.CurrentRule_offerMessage = 'Please enter your date of birth using your phone\'s keypad.';
    context.customerState.CurrentRule_errorMessage1 = 'You didn\'t enter a valid date.';
    context.currentRule.params.errorMessage1 = 'You didn\'t enter a valid date. XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You didn\'t enter a valid date.\nPlease enter your date of birth using your phone\'s keypad.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

  });

  /**
   * Test what happens when a user enters an invalid date in the Date input phase
   */
  it('DTMFInput.input() Date "31022022" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '31022022';
    context.customerState.CurrentRule_dataType = 'Date';
    context.currentRule.params.dataType = 'Date XXX';
    context.currentRule.params.offerMessage = 'Please enter your date of birth using your phone\'s keypad. XXX';
    context.customerState.CurrentRule_offerMessage = 'Please enter your date of birth using your phone\'s keypad.';
    context.customerState.CurrentRule_errorMessage1 = 'You didn\'t enter a valid date.';
    context.currentRule.params.errorMessage1 = 'You didn\'t enter a valid date. XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You didn\'t enter a valid date.\nPlease enter your date of birth using your phone\'s keypad.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

  });

  /**
   * Test what happens when a user enters 1225 in the CreditCardExpiry input phase
   */
  it('DTMFInput.input() CreditCardExpiry "1225" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '1225';
    context.customerState.CurrentRule_dataType = 'CreditCardExpiry';
    context.currentRule.params.dataType = 'CreditCardExpiry XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You entered 1 2 2 5 is that correct? Press 1 to continue, press 2 to try again.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('CurrentRule_input')).to.equal(true);
    expect(context.customerState.CurrentRule_input).to.equal('1225');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

  });

  /**
   * Test what happens when a user enters "0001" in the CreditCardExpiry input phase
   */
  it('DTMFInput.input() CreditCardExpiry "0001" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '0001';
    context.customerState.CurrentRule_dataType = 'CreditCardExpiry';
    context.currentRule.params.dataType = 'CreditCardExpiry XXX';
    context.currentRule.params.offerMessage = 'Please enter your CC expiry date using your phone\'s keypad. XXX';
    context.customerState.CurrentRule_offerMessage = 'Please enter your CC expiry date using your phone\'s keypad.';
    context.customerState.CurrentRule_errorMessage1 = 'You didn\'t enter a valid CC expiry date.';
    context.currentRule.params.errorMessage1 = 'You didn\'t enter a valid CC expiry date. XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You didn\'t enter a valid CC expiry date.\nPlease enter your CC expiry date using your phone\'s keypad.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

  });

  /**
   * Test what happens when a user enters "01" in the CreditCardExpiry input phase
   */
  it('DTMFInput.input() CreditCardExpiry "01" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '01';
    context.customerState.CurrentRule_dataType = 'CreditCardExpiry';
    context.currentRule.params.dataType = 'CreditCardExpiry XXX';
    context.currentRule.params.offerMessage = 'Please enter your CC expiry date using your phone\'s keypad. XXX';
    context.customerState.CurrentRule_offerMessage = 'Please enter your CC expiry date using your phone\'s keypad.';
    context.customerState.CurrentRule_errorMessage1 = 'You didn\'t enter a valid CC expiry date.';
    context.currentRule.params.errorMessage1 = 'You didn\'t enter a valid CC expiry date. XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You didn\'t enter a valid CC expiry date.\nPlease enter your CC expiry date using your phone\'s keypad.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

  });

  /**
   * Test what happens when a user enters "0122" in the CreditCardExpiry input phase
   */
  it('DTMFInput.input() CreditCardExpiry "0122" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '0122';
    context.customerState.CurrentRule_dataType = 'CreditCardExpiry';
    context.currentRule.params.dataType = 'CreditCardExpiry XXX';
    context.currentRule.params.offerMessage = 'Please enter your CC expiry date using your phone\'s keypad. XXX';
    context.customerState.CurrentRule_offerMessage = 'Please enter your CC expiry date using your phone\'s keypad.';
    context.customerState.CurrentRule_errorMessage1 = 'You didn\'t enter a valid CC expiry date.';
    context.currentRule.params.errorMessage1 = 'You didn\'t enter a valid CC expiry date. XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You didn\'t enter a valid CC expiry date.\nPlease enter your CC expiry date using your phone\'s keypad.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

  });

  /**
   * Test what happens when a user enters "NOINPUT" in the CreditCardExpiry input phase
   */
  it('DTMFInput.input() CreditCardExpiry "NOINPUT" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'NOINPUT';
    context.customerState.CurrentRule_dataType = 'CreditCardExpiry';
    context.currentRule.params.dataType = 'CreditCardExpiry XXX';
    context.currentRule.params.offerMessage = 'Please enter your CC expiry date using your phone\'s keypad. XXX';
    context.customerState.CurrentRule_offerMessage = 'Please enter your CC expiry date using your phone\'s keypad.';
    context.customerState.CurrentRule_errorMessage1 = 'You didn\'t enter a valid CC expiry date.';
    context.currentRule.params.errorMessage1 = 'You didn\'t enter a valid CC expiry date. XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You didn\'t enter a valid CC expiry date.\nPlease enter your CC expiry date using your phone\'s keypad.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

  });

  /**
   * Test what happens when a user enters "TEST" in the CreditCardExpiry input phase
   */
  it('DTMFInput.input() CreditCardExpiry "TEST" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'TEST';
    context.customerState.CurrentRule_dataType = 'CreditCardExpiry';
    context.currentRule.params.dataType = 'CreditCardExpiry XXX';
    context.currentRule.params.offerMessage = 'Please enter your CC expiry date using your phone\'s keypad. XXX';
    context.customerState.CurrentRule_offerMessage = 'Please enter your CC expiry date using your phone\'s keypad.';
    context.customerState.CurrentRule_errorMessage1 = 'You didn\'t enter a valid CC expiry date.';
    context.currentRule.params.errorMessage1 = 'You didn\'t enter a valid CC expiry date. XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You didn\'t enter a valid CC expiry date.\nPlease enter your CC expiry date using your phone\'s keypad.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

  });

  /**
   * Test what happens when a user enters a valid phone in the Phone input phase
   */
  it('DTMFInput.input() Phone "0755555555" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '0755555555';
    context.customerState.CurrentRule_dataType = 'Phone';
    context.currentRule.params.dataType = 'Phone XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You entered 0 7 5 5 5 5 5 5 5 5 is that correct? Press 1 to continue, press 2 to try again.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    expect(context.stateToSave.has('CurrentRule_input')).to.equal(true);
    expect(context.customerState.CurrentRule_input).to.equal('0755555555');

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('true');

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('confirm');

  });

  /**
   * Test what happens when a user enters an incomplete phone
   * "073871155" in the Phone input phase
   */
  it('DTMFInput.input() Phone "073871155" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '073871155';
    context.customerState.CurrentRule_dataType = 'Phone';
    context.currentRule.params.dataType = 'Phone XXX';
    context.currentRule.params.offerMessage = 'Please enter your phone number using your phone keypad. XXX';
    context.customerState.CurrentRule_offerMessage = 'Please enter your phone number using your phone keypad.';
    context.customerState.CurrentRule_errorMessage1 = 'You did not enter a valid phone number.';
    context.currentRule.params.errorMessage1 = 'You did not enter a valid phone number. XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You did not enter a valid phone number.\nPlease enter your phone number using your phone keypad.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

  });

  /**
   * Test what happens when a user enters an incomplete phone
   * "6138711551" in the Phone input phase with no area code
   */
  it('DTMFInput.input() Phone "6138711551" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '6138711551';
    context.customerState.CurrentRule_dataType = 'Phone';
    context.currentRule.params.dataType = 'Phone XXX';
    context.currentRule.params.offerMessage = 'Please enter your phone number using your phone keypad. XXX';
    context.customerState.CurrentRule_offerMessage = 'Please enter your phone number using your phone keypad.';
    context.customerState.CurrentRule_errorMessage1 = 'You did not enter a valid phone number.';
    context.currentRule.params.errorMessage1 = 'You did not enter a valid phone number. XXX';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('You did not enter a valid phone number.\nPlease enter your phone number using your phone keypad.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

  });

  /**
   * Test what happens when a user enters '5' during the input
   * phase with an exising error count of 1
   */
  it('DTMFInput.input() Number "5" errorCount: 1', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '5';
    context.customerState.CurrentRule_errorCount = '1';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('Sorry. That is not a valid 4 digit pin code 2.\nPlease enter your 4 digit pincode.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    // No change in the wild
    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('2');
  });

  /**
   * Test what happens when a user enters 'TEST' during the input
   * phase with an exising error count of 1
   */
  it('DTMFInput.input() Number "TEST" errorCount: 1', async function() {

    var context = makeTestContext();

    context.requestMessage.input = 'TEST';
    context.customerState.CurrentRule_errorCount = '1';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('Sorry. That is not a valid 4 digit pin code 2.\nPlease enter your 4 digit pincode.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    // No change in the wild
    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('2');
  });

  /**
   * Test what happens when a user enters '5' during the input
   * phase with an exising error count of 2
   */
  it('DTMFInput.input() Number "5" errorCount: 2', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '5';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_phase = 'input';

    var response = await dtmfInputInteractive.input(context);

    expect(response.message).to.equal('Sorry, I\'m having trouble understanding you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(3);

    // No change in the wild
    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal('false');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Error ruleset');
  });

  /**
   * Test what happens when an unhandled data type is used
   */
  it('DTMFInput.input() NewDataType "0000" errorCount: 0 should fail', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '0000';
    context.customerState.CurrentRule_dataType = 'NewDataType';
    context.currentRule.params.dataType = 'NewDataType XXX';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_phase = 'input';
    try
    {
      var response = await dtmfInputInteractive.input(context);
      fail('input() expect failure with unhandled data type: NewDataType');
    }
    catch (error)
    {
      expect(error.message).to.equal('DTMFInput.input() Unhandled DTMFInput data type: NewDataType');
    }
  });

  /**
   * Test input() failure with invalid input
   */
  it('DTMFInput.input() should fail with invalid context', async function()
  {
    var context = {
    };

    try
    {
      var response = await dtmfInputInteractive.input(context);
      fail('DTMFInput should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('DTMFInput.input() missing required config');
    }
  });

  /**
   * Test what happens when a user enters '1' during the confirm phase
   */
  it('DTMFInput.confirm() Number "1" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '1';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_validInput = 'true';
    context.customerState.CurrentRule_input = '5555';

    var response = await dtmfInputInteractive.confirm(context);

    expect(response.message).to.equal(undefined);
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(1);

    expect(context.stateToSave.has('SomeStateKey')).to.equal(true);
    expect(context.customerState.SomeStateKey).to.equal('5555');
  });

  /**
   * Test what happens when a user enters '2' during the confirm phase
   */
  it('DTMFInput.confirm() Number "2" errorCount: 0', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '2';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_validInput = 'true';
    context.customerState.CurrentRule_input = '5555';

    var response = await dtmfInputInteractive.confirm(context);

    expect(response.message).to.equal('Please enter your 4 digit pincode.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(4);

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('input');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('1');

    expect(context.stateToSave.has('CurrentRule_input')).to.equal(true);
    expect(context.customerState.CurrentRule_input).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal(undefined);

  });

  /**
   * Test what happens when a user enters '2' during the confirm phase
   * with an existing error count of 2
   */
  it('DTMFInput.confirm() Number "2" errorCount: 1', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '2';
    context.customerState.CurrentRule_errorCount = '1';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_validInput = 'true';
    context.customerState.CurrentRule_input = '5555';

    var response = await dtmfInputInteractive.confirm(context);

    expect(response.message).to.equal('Please enter your 4 digit pincode.');
    expect(response.inputRequired).to.equal(true);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(4);

    expect(context.stateToSave.has('CurrentRule_phase')).to.equal(true);
    expect(context.customerState.CurrentRule_phase).to.equal('input');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('2');

    expect(context.stateToSave.has('CurrentRule_input')).to.equal(true);
    expect(context.customerState.CurrentRule_input).to.equal(undefined);

    expect(context.stateToSave.has('CurrentRule_validInput')).to.equal(true);
    expect(context.customerState.CurrentRule_validInput).to.equal(undefined);

  });

  /**
   * Test what happens when a user enters '2' during the confirm phase
   * with an existing error count of 2
   */
  it('DTMFInput.confirm() Number "2" errorCount: 2', async function() {

    var context = makeTestContext();

    context.requestMessage.input = '2';
    context.customerState.CurrentRule_errorCount = '2';
    context.customerState.CurrentRule_phase = 'confirm';
    context.customerState.CurrentRule_validInput = 'true';
    context.customerState.CurrentRule_input = '5555';

    var response = await dtmfInputInteractive.confirm(context);

    expect(response.message).to.equal('Sorry, I\'m having trouble understanding you.');
    expect(response.inputRequired).to.equal(false);
    expect(response.contactId).to.equal('test');
    expect(response.ruleSet).to.equal('My test rule set');
    expect(response.rule).to.equal('My dtmfinput rule');
    expect(response.ruleType).to.equal('DTMFInput');
    expect(response.audio).to.equal(undefined);
    expect(context.stateToSave.size).to.equal(2);

    expect(context.stateToSave.has('NextRuleSet')).to.equal(true);
    expect(context.customerState.NextRuleSet).to.equal('Error ruleset');

    expect(context.stateToSave.has('CurrentRule_errorCount')).to.equal(true);
    expect(context.customerState.CurrentRule_errorCount).to.equal('3');

  });

  /**
   * Test confirm() failure with invalid input
   */
  it('DTMFInput.confirm() should fail', async function()
  {
    var context = {
    };

    try
    {
      var response = await dtmfInputInteractive.confirm(context);
      fail('DTMFInput should fail invalid context');
    }
    catch (error)
    {
      expect(error.message).to.equal('DTMFInput.confirm() missing required config');
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
      name: 'My dtmfinput rule',
      type: 'DTMFInput',
      params: {
        errorCount: '0 XXX',
        offerMessage: 'Please enter your 4 digit pincode. XXX',
        confirmationMessage: 'You entered {{characterSpeechFast SomeStateKey}} is that correct? Press 1 to continue, press 2 to try again. XXX',
        errorMessage1: 'Sorry. That is not a valid 4 digit pin code 1. XXX',
        errorMessage2: 'Sorry. That is not a valid 4 digit pin code 2. XXX',
        errorMessage3: 'Sorry, I\'m having trouble understanding you. XXX',
        errorRuleSetName: 'Error ruleset XXX',
        outputStateKey: 'SomeStateKey XXX',
        dataType: 'Number XXX',
        minLength: '4 XXX',
        maxLength: '10 XXX'
      }
    },
    customerState: {
      CurrentRule_errorCount: '0',
      CurrentRule_offerMessage: 'Please enter your 4 digit pincode.',
      CurrentRule_confirmationMessage: 'You entered {{characterSpeechFast SomeStateKey}} is that correct? Press 1 to continue, press 2 to try again.',
      CurrentRule_errorMessage1: 'Sorry. That is not a valid 4 digit pin code 1.',
      CurrentRule_errorMessage2: 'Sorry. That is not a valid 4 digit pin code 2.',
      CurrentRule_errorMessage3: 'Sorry, I\'m having trouble understanding you.',
      CurrentRule_errorRuleSetName: 'Error ruleset',
      CurrentRule_outputStateKey: 'SomeStateKey',
      CurrentRule_dataType: 'Number',
      CurrentRule_minLength: '4',
      CurrentRule_maxLength: '10'
    },
    stateToSave: new Set()
  };
}
