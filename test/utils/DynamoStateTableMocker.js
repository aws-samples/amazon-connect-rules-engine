const AWS = require('aws-sdk');

/**
 * A state map that holds customer state keyed by contact id
 */
var stateMap = new Map();

/**
 * Injects initial customer state
 */
module.exports.injectState = (contactId, customerState) =>
{
  console.info(`DynamoStateTableMocker.injectState() Injecting state for contact id: ${contactId} = ${JSON.stringify(customerState, null, 2)}`);
  stateMap.set(contactId, customerState);
};

/**
 *  Provides a convenient way to mock customer state via DDB
 */
module.exports.setupMockDynamo = (AWSMock, dynamoUtils) =>
{
  AWSMock.mock('DynamoDB', 'executeStatement', (function (params, callback)
  {
    if (params.Statement.includes('SELECT *') && params.Statement.includes(process.env["STATE_TABLE"]))
    {
      //console.info('DynamoStateTableMocker.setupMockDynamo(executeStatement) Detected state table query: ' + JSON.stringify(params, null, 2));
      var contactId = params.Parameters[0].S;
      var stateItems = getStateItemsForContactId(contactId);
      callback(null, { Items: stateItems });
    }
    else
    {
      var message = 'DynamoStateTableMocker.setupMockDynamo(executeStatement) Unhandled mock request: ' + JSON.stringify(params, null, 2);
      console.error(message);
      callback(message, null);
    }
  }));

  AWSMock.mock('DynamoDB', 'batchWriteItem', (function (params, callback)
  {
    var stateTableName = process.env.STATE_TABLE;

    var keys = Object.keys(params.RequestItems);

    for (var i = 0; i < keys.length; i++)
    {
      if (keys[i] !== stateTableName)
      {
        callback('DynamoStateTableMocker.setupMockDynamo(batchWriteItem) Unhandled table in batchWriteItem(): ' + keys[i], null);
        return;
      }

      var stateRequests = params.RequestItems[keys[i]];

      for (var s = 0; s < stateRequests.length; s++)
      {
        var stateRequest = stateRequests[s];

        if (stateRequest.PutRequest !== undefined)
        {
          upsertStateItem(stateRequest.PutRequest.Item);
        }
        else if (stateRequest.DeleteRequest !== undefined)
        {
          deleteStateItem(stateRequest.DeleteRequest.Key);
        }
        else
        {
          callback('DynamoStateTableMocker.setupMockDynamo(batchWriteItem) Unhandled operation: ' + JSON.stringify(stateRequest, null, 2), null);
          return;
        }
      }
    }

    callback(null, {
      UnprocessedItems: {}
    });
  }));

  dynamoUtils.setDynamoDB(new AWS.DynamoDB())
};

function saveState(contactId, state)
{
  stateMap.set(contactId, state);
}

/**
 * Fetches a clone of the existing state
 */
function getExistingState(contactId)
{
  var existingState = stateMap.get(contactId);

  if (existingState === undefined)
  {
    existingState = {};
  }
  else
  {
    return JSON.parse(JSON.stringify(existingState));
  }

  return existingState;
}

/**
 * UPserts an item into state
 */
function upsertStateItem(item)
{
  var contactId = item.ContactId.S;
  var key = item.What.S;
  var value = item.Value.S;

  var existingState = getExistingState(contactId);

  if (typeof value === 'object')
  {
    value = JSON.stringify(value);
  }

  existingState[key] = value;
  saveState(contactId, existingState);
}

/**
 * Deletes and item from state
 */
function deleteStateItem(key)
{
  var contactId = key.ContactId.S;
  var key = key.What.S;

  var existingState = getExistingState(contactId);
  delete existingState[key];
  saveState(contactId, existingState);
}

/**
 * Creates an existing state record into an array of DDB items
 */
function getStateItemsForContactId(contactId)
{
  var expiry = Math.floor(new Date().getTime() / 1000) + 4 * 60 * 60;

  var items = [];

  var existingState = getExistingState(contactId);

  var stateKeys = Object.keys(existingState);

  for (var i = 0; i < stateKeys.length; i++)
  {
    var key = stateKeys[i];
    var value = existingState[key];

    if (typeof value === 'object')
    {
      value = JSON.stringify(value);
    }

    var item = {
      ContactId: { S: contactId },
      What: { S: key },
      Value: { S: '' + value },
      Expiry: { N: '' + expiry }
    };

    items.push(item);
  }

  return items;
}
