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

  // Tests update state with a bunch of scenarios
  it('InferenceUtils.updateState()', async function()
  {
    var state = {};
    var stateToSave = new Set();

    // Simple use case
    inferenceUtils.updateState(state, stateToSave, 'simple', 'value');
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple).to.equal('value');

    // New nested key
    state = {};
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.nested1', 'nested1');
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple.nested1).to.equal('nested1');

    // New nested under existing top level
    inferenceUtils.updateState(state, stateToSave, 'simple.nested2', 'nested2');
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple.nested2).to.equal('nested2');

    // Update existing nested key
    inferenceUtils.updateState(state, stateToSave, 'simple.nested2', 'nested2a');
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple.nested2).to.equal('nested2a');

    // Attempt to add a sub key to an existing string
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.nested1.deeper', 'deeper');
    expect(stateToSave.has('simple')).to.equal(false);
    expect(state.simple.nested1.deeper).to.equal(undefined);

    // Set an array
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.nested3', ['foo']);
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple.nested3[0]).to.equal('foo');
    expect(state.simple.nested3.length).to.equal(1);

    // Update a sub key of an array
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.nested3.blerg', 'smeh');
    expect(stateToSave.has('simple')).to.equal(false);
    expect(state.simple.nested3.berg).to.equal(undefined);

    // Update an index of an exising array
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.nested3.0', 'bletch');
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple.nested3[0]).to.equal('bletch');

    // Insert an array element
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.nested3.1', { fneh: -5 });
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple.nested3[1].fneh).to.equal(-5);

    // Insert an array element with gaps
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.nested3.5', { smep: 'hey' });
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple.nested3[2]).to.equal(undefined);
    expect(state.simple.nested3[3]).to.equal(undefined);
    expect(state.simple.nested3[4]).to.equal(undefined);
    expect(state.simple.nested3[5].smep).to.equal('hey');

    // Attempt to manipulate length
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.nested3.length', 10);
    expect(stateToSave.has('simple')).to.equal(false);
    expect(state.simple.nested3.length).to.equal(6);

    // Negative index
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.nested3.-1', 'stuff');
    expect(stateToSave.has('simple')).to.equal(false);

    // Create a new array
    state = {};
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.myarray.1', 'stuff');
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple.myarray[0]).to.equal(undefined);
    expect(state.simple.myarray[1]).to.equal('stuff');

    // Update the array
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.myarray.0', 'first');
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple.myarray[0]).to.equal('first');
    expect(state.simple.myarray[1]).to.equal('stuff');

    // Create a new key with a new nested array
    state = {};
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.myarray.0.fneh.1.blerg.foo', 'whoah');
    expect(stateToSave.has('simple')).to.equal(true);
    expect(state.simple.myarray[0].fneh[0]).to.equal(undefined);
    expect(state.simple.myarray[0].fneh[1].blerg.foo).to.equal('whoah');

    // Update a complex sub key with undefined expecting no changes
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, 'simple.myarray.0.test.0.junk', '');
    expect(stateToSave.has('simple')).to.equal(false);
    expect(state.simple.myarray[0].test).to.equal(undefined);

    // Setting invalid empty keys
    state = {};
    stateToSave.clear();
    inferenceUtils.updateState(state, stateToSave, '', 'foo');
    expect(stateToSave.size).to.equal(0);
    expect(JSON.stringify(state)).to.equal('{}');

    inferenceUtils.updateState(state, stateToSave, null, 'foo');
    expect(stateToSave.size).to.equal(0);
    expect(JSON.stringify(state)).to.equal('{}');

    inferenceUtils.updateState(state, stateToSave, undefined, 'foo');
    expect(stateToSave.size).to.equal(0);
    expect(JSON.stringify(state)).to.equal('{}');

    inferenceUtils.updateState(state, stateToSave, 'null', 'foo');
    expect(stateToSave.size).to.equal(0);
    expect(JSON.stringify(state)).to.equal('{}');

    inferenceUtils.updateState(state, stateToSave, 'undefined', 'foo');
    expect(stateToSave.size).to.equal(0);
    expect(JSON.stringify(state)).to.equal('{}');
  });

  // Tests validating date slots
  it('InferenceUtils.validateSlotDate()', async function()
  {
    var yesterday = inferenceUtils.parseValidationDate('yesterday').format('YYYY-MM-DD');
    var today = inferenceUtils.parseValidationDate('today').format('YYYY-MM-DD');
    var tomorrow = inferenceUtils.parseValidationDate('tomorrow').format('YYYY-MM-DD');

    console.info(`Yesterday: ${yesterday} Today: ${today} Tomorrow: ${tomorrow}`);

    try
    {
      inferenceUtils.parseValidationDate('11-12-2000');
      throw new Error('Should fail with invalid date');
    }
    catch (error)
    {
      expect(error.message).to.equal('Failed to parse date string: 11-12-2000');
    }

    try
    {
      inferenceUtils.parseValidationDate('2000-00-01');
      throw new Error('Should fail with invalid date');
    }
    catch (error)
    {
      expect(error.message).to.equal('Failed to parse date string: 2000-00-01');
    }

    try
    {
      inferenceUtils.parseValidationDate('undefined');
      throw new Error('Should fail with invalid date');
    }
    catch (error)
    {
      expect(error.message).to.equal('Failed to parse date string: undefined');
    }

    expect(inferenceUtils.parseValidationDate(undefined)).to.equal(undefined);
    expect(inferenceUtils.validateSlotDate('2000-13-01', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotDate('00000-0-01', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotDate('2000-01-0A', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotDate('blergg', '', '')).to.equal(false);

    expect(inferenceUtils.validateSlotDate('', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotDate(undefined, '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotDate('2000-01-01', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotDate('2000-01-01', yesterday, '')).to.equal(false);
    expect(inferenceUtils.validateSlotDate('2000-01-01', undefined, yesterday)).to.equal(true);
    expect(inferenceUtils.validateSlotDate(today, yesterday, tomorrow)).to.equal(true);
    expect(inferenceUtils.validateSlotDate(today, '2000-25-01', tomorrow)).to.equal(false);
    expect(inferenceUtils.validateSlotDate(yesterday, today, tomorrow)).to.equal(false);
    expect(inferenceUtils.validateSlotDate(tomorrow, yesterday, today)).to.equal(false);
    expect(inferenceUtils.validateSlotDate(tomorrow, yesterday, undefined)).to.equal(true);
  });

  // Tests validating phone slots
  it('InferenceUtils.validateSlotPhone()', async function()
  {
    expect(inferenceUtils.validateSlotPhone('', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotPhone(undefined, '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotPhone('131001', '', '')).to.equal(false);

    expect(inferenceUtils.validateSlotPhone('+61422529062', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotPhone('0422529063', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotPhone('04225', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotPhone('0x0x0x0x0x', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotPhone('07888899991', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotPhone('0737811551', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotPhone('+617378115512', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotPhone('+6173781155', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotPhone('0737811551a', '', '')).to.equal(false);

    expect(inferenceUtils.validateSlotPhone('0422529063', '04', '05')).to.equal(true);
    expect(inferenceUtils.validateSlotPhone('0422529063', '07', '08')).to.equal(false);
    expect(inferenceUtils.validateSlotPhone('0422529063', '0400000000', '05')).to.equal(true);
    expect(inferenceUtils.validateSlotPhone('0400000000', '0400000001', '0499999999')).to.equal(false);
    expect(inferenceUtils.validateSlotPhone('0737811551', '0700000000', '0799999999')).to.equal(true);
    expect(inferenceUtils.validateSlotPhone('0337811551', '0700000000', '0799999999')).to.equal(false);

  });

  // Tests validating number slots
  it('InferenceUtils.validateSlotNumber()', async function()
  {
    expect(inferenceUtils.validateSlotNumber('', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotNumber(undefined, '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotNumber('-1', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotNumber('-1', '0', '100')).to.equal(false);
    expect(inferenceUtils.validateSlotNumber('999', '0', '999')).to.equal(true);
    expect(inferenceUtils.validateSlotNumber('000', '0', '999')).to.equal(true);
    expect(inferenceUtils.validateSlotNumber('010', '0', '999')).to.equal(true);
    expect(inferenceUtils.validateSlotNumber('0010', '0', '999')).to.equal(true);
    expect(inferenceUtils.validateSlotNumber('5', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotNumber('5', '10', '0')).to.equal(false);
    expect(inferenceUtils.validateSlotNumber('4066', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotNumber('4066', '4000', '4066')).to.equal(true);
    expect(inferenceUtils.validateSlotNumber(4066, '1000', '9999')).to.equal(true);
    expect(inferenceUtils.validateSlotNumber(999, 1000, 9999)).to.equal(false);
  });

  // Tests validating time slots
  it('InferenceUtils.validateSlotTime()', async function()
  {
    expect(inferenceUtils.validateSlotTime('', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotTime(undefined, '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotTime('12:01', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotTime('00:00', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotTime('00:01', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotTime('24:00', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotTime('23:60', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotTime('23:61', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotTime('-1:-1', '', '')).to.equal(false);
    expect(inferenceUtils.validateSlotTime('03:45', '', '')).to.equal(true);
    expect(inferenceUtils.validateSlotTime('3:40', '', '')).to.equal(false);

    expect(inferenceUtils.validateSlotTime('09:00', '09:00', '')).to.equal(true);
    expect(inferenceUtils.validateSlotTime('09:00', '', '17:00')).to.equal(true);
    expect(inferenceUtils.validateSlotTime('12:00', '09:00', '17:00')).to.equal(true);
    expect(inferenceUtils.validateSlotTime('09:00', '09:00', '17:00')).to.equal(true);
    expect(inferenceUtils.validateSlotTime('08:59', '09:00', '17:00')).to.equal(false);
    expect(inferenceUtils.validateSlotTime('17:01', '09:00', '17:00')).to.equal(false);
    expect(inferenceUtils.validateSlotTime('09:00', '00:00', '24:00')).to.equal(true);


  });

});
