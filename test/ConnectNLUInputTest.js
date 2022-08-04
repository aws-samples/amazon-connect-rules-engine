// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var rewire = require('rewire');
var sinon = require('sinon');
const expect = require('chai').expect;
const AWSMock = require('aws-sdk-mock');
const config = require('./utils/config');
var connectNLUInput = rewire('../lambda/ConnectNLUInput');
var dynamoStateTableMocker = require('./utils/DynamoStateTableMocker');
var dynamoUtils = require('../lambda/utils/DynamoUtils');
var configUtils = require('../lambda/utils/ConfigUtils');

/**
 * ConnectNLUInput tests
 */
describe('ConnectNLUInputTests', function()
{
  this.beforeAll(function () {
    config.loadEnv();
    AWSMock.restore();
    // Mock state loading and saving
    dynamoStateTableMocker.setupMockDynamo(AWSMock, dynamoUtils);

    var getLexBots = sinon.fake.returns([
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

  this.afterAll(function () {
    AWSMock.restore('DynamoDB');
    sinon.restore();
  });

  // Vanilla execution
  it('ConnectNLUInput.handler() vanilla execution', async function()
  {
    var contactId = 'test-contact-id';

    var state =
    {
      ContactId: contactId,
      System: {},
      CurrentRule_ruleType: 'NLUMenu',
      CurrentRule_offerMessage: 'This is the offer message',
      CurrentRule_confirmationMessage: 'You said {{SMEH}}',
      CurrentRule_outputStateKey: 'SMEH',
      CurrentRule_errorMessage1: 'This is the first error message',
      CurrentRule_errorMessage2: 'This is the second error message',
      CurrentRule_errorMessage3: 'This is the third error message',
      CurrentRule_inputCount: 'bleerrgg', // test defaulting this to 3
      CurrentRule_errorCount: 'merrrgghhh', // test defaulting this to 0
      CurrentRule_errorRuleSetName: 'NoMatch ruleset',
      CurrentRule_dataType: 'date'

    };

    dynamoStateTableMocker.injectState(contactId, state);

    // TODO use sinon to control configUtils

    var context = {};

    var event =
    {
      Details:
      {
        ContactData:
        {
          InitialContactId: contactId
        },
        Parameters:
        {
          matchedIntent: 'intentdata',
          slotValue: '2017-09-25',
          intentConfidence: '0.9'
        }
      }
    };

    // Run the Lambda
    await connectNLUInput.handler(event, state);

    // Reload state from the mock
    var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

    // Assert new state
    expect(newState.CurrentRule_terminate).to.equal('false');
    expect(newState.CurrentRule_validInput).to.equal('true');
    expect(newState.CurrentRule_slotValue).to.equal('2017-09-25');
    expect(newState.System.LastNLUInput).to.equal('2017-09-25');
  });

  // // Invalid event execution
  // it('ConnectDTMFMenu.handler() invalid event', async function()
  // {
  //   var contactId = 'test-contact-id';

  //   var state =
  //   {
  //     ContactId: contactId,
  //     System: {}
  //   };

  //   dynamoStateTableMocker.injectState(contactId, state);

  //   var context = {};

  //   // Borked event
  //   var event =
  //   {
  //     Details:
  //     {
  //     }
  //   };

  //   // Run the Lambda expecting an error
  //   try
  //   {
  //     await connectDTMFMenu.handler(event, state);
  //     fail('handler() should fail with invalid event');
  //   }
  //   catch (error)
  //   {
  //     expect(error.message.startsWith('Cannot read')).to.equal(true);
  //   }
  // });

  // // noinput timeout before max
  // it('ConnectDTMFMenu.handler() noinput timeout before max', async function()
  // {
  //   var contactId = 'test-contact-id';

  //   var state =
  //   {
  //     ContactId: contactId,
  //     System: {},
  //     CurrentRule_ruleType: 'DTMFMenu',
  //     CurrentRule_offerMessage: 'This is the offer message',
  //     CurrentRule_errorMessage1: 'This is the first error message',
  //     CurrentRule_errorMessage2: 'This is the second error message',
  //     CurrentRule_inputCount: '2',
  //     CurrentRule_errorCount: '0',
  //     CurrentRule_errorRuleSetName: 'NoMatch ruleset',
  //     CurrentRule_noInputRuleSetName: 'NoInput ruleset',
  //     CurrentRule_dtmf1: 'User pressed 1',
  //     CurrentRule_dtmf2: 'User pressed 2',
  //     CurrentRule_dtmf9: 'User pressed 9',
  //     CurrentRule_dtmf0: 'User pressed 0'
  //   };

  //   dynamoStateTableMocker.injectState(contactId, state);

  //   var context = {};

  //   var event =
  //   {
  //     Details:
  //     {
  //       ContactData:
  //       {
  //         InitialContactId: contactId
  //       },
  //       Parameters:
  //       {
  //         selectedOption: 'Timeout'
  //       }
  //     }
  //   };

  //   // Run the Lambda
  //   await connectDTMFMenu.handler(event, state);

  //   // Reload state from the mock
  //   var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

  //   // Assert new state
  //   expect(newState.NextRuleSet).to.equal(undefined);
  //   expect(newState.CurrentRule_done).to.equal('false');
  //   expect(newState.CurrentRule_terminate).to.equal('false');
  //   expect(newState.CurrentRule_validSelection).to.equal('false');
  //   expect(newState.CurrentRule_failureReason).to.equal('NOINPUT');
  //   expect(newState.System.LastSelectedDTMF).to.equal(undefined);
  // });

  // // noinput timeout at max
  // it('ConnectDTMFMenu.handler() noinput timeout at max', async function()
  // {
  //   var contactId = 'test-contact-id';

  //   var state =
  //   {
  //     ContactId: contactId,
  //     System: {},
  //     CurrentRule_ruleType: 'DTMFMenu',
  //     CurrentRule_offerMessage: 'This is the offer message',
  //     CurrentRule_errorMessage1: 'This is the first error message',
  //     CurrentRule_errorMessage2: 'This is the second error message',
  //     CurrentRule_inputCount: '2',
  //     CurrentRule_errorCount: '1',
  //     CurrentRule_errorRuleSetName: 'NoMatch ruleset',
  //     CurrentRule_noInputRuleSetName: 'NoInput ruleset',
  //     CurrentRule_dtmf1: 'User pressed 1',
  //     CurrentRule_dtmf2: 'User pressed 2',
  //     CurrentRule_dtmf9: 'User pressed 9',
  //     CurrentRule_dtmf0: 'User pressed 0'
  //   };

  //   dynamoStateTableMocker.injectState(contactId, state);

  //   var context = {};

  //   var event =
  //   {
  //     Details:
  //     {
  //       ContactData:
  //       {
  //         InitialContactId: contactId
  //       },
  //       Parameters:
  //       {
  //         selectedOption: 'Timeout'
  //       }
  //     }
  //   };

  //   // Run the Lambda
  //   await connectDTMFMenu.handler(event, state);

  //   // Reload state from the mock
  //   var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

  //   // Assert new state
  //   expect(newState.NextRuleSet).to.equal('NoInput ruleset');
  //   expect(newState.CurrentRule_done).to.equal('true');
  //   expect(newState.CurrentRule_terminate).to.equal('false');
  //   expect(newState.CurrentRule_validSelection).to.equal('false');
  //   expect(newState.CurrentRule_failureReason).to.equal('NOINPUT');
  //   expect(newState.System.LastSelectedDTMF).to.equal(undefined);
  // });

  // // noinput timeout at max hangup
  // it('ConnectDTMFMenu.handler() noinput timeout at max hangup', async function()
  // {
  //   var contactId = 'test-contact-id';

  //   var state =
  //   {
  //     ContactId: contactId,
  //     System: {},
  //     CurrentRule_ruleType: 'DTMFMenu',
  //     CurrentRule_offerMessage: 'This is the offer message',
  //     CurrentRule_errorMessage1: 'This is the first error message',
  //     CurrentRule_errorMessage2: 'This is the second error message',
  //     CurrentRule_inputCount: '2',
  //     CurrentRule_errorCount: '1',
  //     CurrentRule_errorRuleSetName: '',
  //     CurrentRule_noInputRuleSetName: '',
  //     CurrentRule_dtmf1: 'User pressed 1',
  //     CurrentRule_dtmf2: 'User pressed 2',
  //     CurrentRule_dtmf9: 'User pressed 9',
  //     CurrentRule_dtmf0: 'User pressed 0'
  //   };

  //   dynamoStateTableMocker.injectState(contactId, state);

  //   var context = {};

  //   var event =
  //   {
  //     Details:
  //     {
  //       ContactData:
  //       {
  //         InitialContactId: contactId
  //       },
  //       Parameters:
  //       {
  //         selectedOption: 'Timeout'
  //       }
  //     }
  //   };

  //   // Run the Lambda
  //   await connectDTMFMenu.handler(event, state);

  //   // Reload state from the mock
  //   var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

  //   // Assert new state
  //   expect(newState.NextRuleSet).to.equal(undefined);
  //   expect(newState.CurrentRule_done).to.equal('true');
  //   expect(newState.CurrentRule_terminate).to.equal('true');
  //   expect(newState.CurrentRule_validSelection).to.equal('false');
  //   expect(newState.CurrentRule_failureReason).to.equal('NOINPUT');
  //   expect(newState.System.LastSelectedDTMF).to.equal(undefined);
  // });

  // // nomatch before max
  // it('ConnectDTMFMenu.handler() nomatch before max', async function()
  // {
  //   var contactId = 'test-contact-id';

  //   var state =
  //   {
  //     ContactId: contactId,
  //     System: {},
  //     CurrentRule_ruleType: 'DTMFMenu',
  //     CurrentRule_offerMessage: 'This is the offer message',
  //     CurrentRule_errorMessage1: 'This is the first error message',
  //     CurrentRule_errorMessage2: 'This is the second error message',
  //     CurrentRule_inputCount: '2',
  //     CurrentRule_errorCount: '0',
  //     CurrentRule_errorRuleSetName: 'NoMatch ruleset',
  //     CurrentRule_noInputRuleSetName: 'NoInput ruleset',
  //     CurrentRule_dtmf1: 'User pressed 1',
  //     CurrentRule_dtmf2: 'User pressed 2',
  //     CurrentRule_dtmf9: 'User pressed 9',
  //     CurrentRule_dtmf0: 'User pressed 0'
  //   };

  //   dynamoStateTableMocker.injectState(contactId, state);

  //   var context = {};

  //   var event =
  //   {
  //     Details:
  //     {
  //       ContactData:
  //       {
  //         InitialContactId: contactId
  //       },
  //       Parameters:
  //       {
  //         selectedOption: '5'
  //       }
  //     }
  //   };

  //   // Run the Lambda
  //   await connectDTMFMenu.handler(event, state);

  //   // Reload state from the mock
  //   var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

  //   // Assert new state
  //   expect(newState.NextRuleSet).to.equal(undefined);
  //   expect(newState.CurrentRule_done).to.equal('false');
  //   expect(newState.CurrentRule_terminate).to.equal('false');
  //   expect(newState.CurrentRule_validSelection).to.equal('false');
  //   expect(newState.CurrentRule_failureReason).to.equal('NOMATCH');
  //   expect(newState.System.LastSelectedDTMF).to.equal(undefined);
  // });

  // // nomatch at max
  // it('ConnectDTMFMenu.handler() nomatch at max', async function()
  // {
  //   var contactId = 'test-contact-id';

  //   var state =
  //   {
  //     ContactId: contactId,
  //     System: {},
  //     CurrentRule_ruleType: 'DTMFMenu',
  //     CurrentRule_offerMessage: 'This is the offer message',
  //     CurrentRule_errorMessage1: 'This is the first error message',
  //     CurrentRule_errorMessage2: 'This is the second error message',
  //     CurrentRule_inputCount: '2',
  //     CurrentRule_errorCount: '1',
  //     CurrentRule_errorRuleSetName: 'NoMatch ruleset',
  //     CurrentRule_noInputRuleSetName: 'NoInput ruleset',
  //     CurrentRule_dtmf1: 'User pressed 1',
  //     CurrentRule_dtmf2: 'User pressed 2',
  //     CurrentRule_dtmf9: 'User pressed 9',
  //     CurrentRule_dtmf0: 'User pressed 0'
  //   };

  //   dynamoStateTableMocker.injectState(contactId, state);

  //   var context = {};

  //   var event =
  //   {
  //     Details:
  //     {
  //       ContactData:
  //       {
  //         InitialContactId: contactId
  //       },
  //       Parameters:
  //       {
  //         selectedOption: '5'
  //       }
  //     }
  //   };

  //   // Run the Lambda
  //   await connectDTMFMenu.handler(event, state);

  //   // Reload state from the mock
  //   var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

  //   // Assert new state
  //   expect(newState.NextRuleSet).to.equal('NoMatch ruleset');
  //   expect(newState.CurrentRule_done).to.equal('true');
  //   expect(newState.CurrentRule_terminate).to.equal('false');
  //   expect(newState.CurrentRule_validSelection).to.equal('false');
  //   expect(newState.CurrentRule_failureReason).to.equal('NOMATCH');
  //   expect(newState.System.LastSelectedDTMF).to.equal(undefined);
  // });

  // // nomatch hangup
  // it('ConnectDTMFMenu.handler() nomatch at max hangup', async function()
  // {
  //   var contactId = 'test-contact-id';

  //   var state =
  //   {
  //     ContactId: contactId,
  //     System: {},
  //     CurrentRule_ruleType: 'DTMFMenu',
  //     CurrentRule_offerMessage: 'This is the offer message',
  //     CurrentRule_errorMessage1: 'This is the first error message',
  //     CurrentRule_errorMessage2: 'This is the second error message',
  //     CurrentRule_inputCount: '2',
  //     CurrentRule_errorCount: '1',
  //     CurrentRule_errorRuleSetName: '',
  //     CurrentRule_noInputRuleSetName: '',
  //     CurrentRule_dtmf1: 'User pressed 1',
  //     CurrentRule_dtmf2: 'User pressed 2',
  //     CurrentRule_dtmf9: 'User pressed 9',
  //     CurrentRule_dtmf0: 'User pressed 0'
  //   };

  //   dynamoStateTableMocker.injectState(contactId, state);

  //   var context = {};

  //   var event =
  //   {
  //     Details:
  //     {
  //       ContactData:
  //       {
  //         InitialContactId: contactId
  //       },
  //       Parameters:
  //       {
  //         selectedOption: '5'
  //       }
  //     }
  //   };

  //   // Run the Lambda
  //   await connectDTMFMenu.handler(event, state);

  //   // Reload state from the mock
  //   var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

  //   // Assert new state
  //   expect(newState.NextRuleSet).to.equal(undefined);
  //   expect(newState.CurrentRule_done).to.equal('true');
  //   expect(newState.CurrentRule_terminate).to.equal('true');
  //   expect(newState.CurrentRule_validSelection).to.equal('false');
  //   expect(newState.CurrentRule_failureReason).to.equal('NOMATCH');
  //   expect(newState.System.LastSelectedDTMF).to.equal(undefined);
  // });


  // // nomatch weird inputs
  // it('ConnectDTMFMenu.handler() nomatch weird inputs', async function()
  // {
  //   var contactId = 'test-contact-id';

  //   var context = {};

  //   // * input
  //   var state =
  //   {
  //     ContactId: contactId,
  //     System: {},
  //     CurrentRule_ruleType: 'DTMFMenu',
  //     CurrentRule_offerMessage: 'This is the offer message',
  //     CurrentRule_errorMessage1: 'This is the first error message',
  //     CurrentRule_errorMessage2: 'This is the second error message',
  //     CurrentRule_inputCount: '2',
  //     CurrentRule_errorCount: '0',
  //     CurrentRule_errorRuleSetName: 'NoMatch ruleset',
  //     CurrentRule_noInputRuleSetName: 'NoInput ruleset',
  //     CurrentRule_dtmf1: 'User pressed 1',
  //     CurrentRule_dtmf2: 'User pressed 2',
  //     CurrentRule_dtmf9: 'User pressed 9',
  //     CurrentRule_dtmf0: 'User pressed 0'
  //   };

  //   dynamoStateTableMocker.injectState(contactId, state);

  //   var event =
  //   {
  //     Details:
  //     {
  //       ContactData:
  //       {
  //         InitialContactId: contactId
  //       },
  //       Parameters:
  //       {
  //         selectedOption: '*'
  //       }
  //     }
  //   };

  //   // Run the Lambda
  //   await connectDTMFMenu.handler(event, state);

  //   // Reload state from the mock
  //   var newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

  //   // Assert new state
  //   expect(newState.NextRuleSet).to.equal(undefined);
  //   expect(newState.CurrentRule_done).to.equal('false');
  //   expect(newState.CurrentRule_terminate).to.equal('false');
  //   expect(newState.CurrentRule_validSelection).to.equal('false');
  //   expect(newState.CurrentRule_failureReason).to.equal('NOMATCH');
  //   expect(newState.System.LastSelectedDTMF).to.equal(undefined);

  //   // + input
  //   state =
  //   {
  //     ContactId: contactId,
  //     System: {},
  //     CurrentRule_ruleType: 'DTMFMenu',
  //     CurrentRule_offerMessage: 'This is the offer message',
  //     CurrentRule_errorMessage1: 'This is the first error message',
  //     CurrentRule_errorMessage2: 'This is the second error message',
  //     CurrentRule_inputCount: '2',
  //     CurrentRule_errorCount: '0',
  //     CurrentRule_errorRuleSetName: 'NoMatch ruleset',
  //     CurrentRule_noInputRuleSetName: 'NoInput ruleset',
  //     CurrentRule_dtmf1: 'User pressed 1',
  //     CurrentRule_dtmf2: 'User pressed 2',
  //     CurrentRule_dtmf9: 'User pressed 9',
  //     CurrentRule_dtmf0: 'User pressed 0'
  //   };

  //   dynamoStateTableMocker.injectState(contactId, state);

  //   event =
  //   {
  //     Details:
  //     {
  //       ContactData:
  //       {
  //         InitialContactId: contactId
  //       },
  //       Parameters:
  //       {
  //         selectedOption: '+'
  //       }
  //     }
  //   };

  //   // Run the Lambda
  //   await connectDTMFMenu.handler(event, state);

  //   // Reload state from the mock
  //   newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

  //   // Assert new state
  //   expect(newState.NextRuleSet).to.equal(undefined);
  //   expect(newState.CurrentRule_done).to.equal('false');
  //   expect(newState.CurrentRule_terminate).to.equal('false');
  //   expect(newState.CurrentRule_validSelection).to.equal('false');
  //   expect(newState.CurrentRule_failureReason).to.equal('NOMATCH');
  //   expect(newState.System.LastSelectedDTMF).to.equal(undefined);

  //   // # input
  //   state =
  //   {
  //     ContactId: contactId,
  //     System: {},
  //     CurrentRule_ruleType: 'DTMFMenu',
  //     CurrentRule_offerMessage: 'This is the offer message',
  //     CurrentRule_errorMessage1: 'This is the first error message',
  //     CurrentRule_errorMessage2: 'This is the second error message',
  //     CurrentRule_inputCount: '2',
  //     CurrentRule_errorCount: '0',
  //     CurrentRule_errorRuleSetName: 'NoMatch ruleset',
  //     CurrentRule_noInputRuleSetName: 'NoInput ruleset',
  //     CurrentRule_dtmf1: 'User pressed 1',
  //     CurrentRule_dtmf2: 'User pressed 2',
  //     CurrentRule_dtmf9: 'User pressed 9',
  //     CurrentRule_dtmf0: 'User pressed 0'
  //   };

  //   dynamoStateTableMocker.injectState(contactId, state);

  //   event =
  //   {
  //     Details:
  //     {
  //       ContactData:
  //       {
  //         InitialContactId: contactId
  //       },
  //       Parameters:
  //       {
  //         selectedOption: '#'
  //       }
  //     }
  //   };

  //   // Run the Lambda
  //   await connectDTMFMenu.handler(event, state);

  //   // Reload state from the mock
  //   newState = await dynamoUtils.getParsedCustomerState(process.env.STATE_TABLE, contactId);

  //   // Assert new state
  //   expect(newState.NextRuleSet).to.equal(undefined);
  //   expect(newState.CurrentRule_done).to.equal('false');
  //   expect(newState.CurrentRule_terminate).to.equal('false');
  //   expect(newState.CurrentRule_validSelection).to.equal('false');
  //   expect(newState.CurrentRule_failureReason).to.equal('NOMATCH');
  //   expect(newState.System.LastSelectedDTMF).to.equal(undefined);
  // });


});

