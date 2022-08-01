
var requestUtils = require('./utils/RequestUtils.js');
var dynamoUtils = require('./utils/DynamoUtils.js');
var configUtils = require('./utils/ConfigUtils.js');

/**
 * Creates a new user in DynamoDB
 */
exports.handler = async(event, context) =>
{
  try
  {
    requestUtils.logRequest(event);
    requestUtils.checkOrigin(event);
    var user = await requestUtils.verifyAPIKey(event);
    requestUtils.requireRole(user, ['ADMINISTRATOR']);

    var body = JSON.parse(event.body);
    var firstName = body.firstName;
    var lastName = body.lastName;
    var emailAddress = body.emailAddress;
    var userRole = body.userRole;
    var apiKey = body.apiKey;
    var userEnabled = body.userEnabled;

    // Check for an existing user with this email
    var existingUser = await dynamoUtils.getUserByEmailAddress(process.env.USERS_TABLE, emailAddress);
    if (existingUser !== undefined)
    {
      console.log('[ERROR] user already exists with this email address: ' + emailAddress);

      return requestUtils.buildFailureResponse(409, {
        message: 'User already exists for email'
      });
    }

    // Check for an existing user with this API key
    existingUser = await dynamoUtils.getUserByAPIKey(process.env.USERS_TABLE, apiKey);
    if (existingUser !== undefined)
    {
      console.log('[ERROR] user already exists with this API key: ' + apiKey);

      return requestUtils.buildFailureResponse(409, {
        message: 'User already exists with API key'
      });
    }

    // This is a novel user so create it
    var userId = await dynamoUtils.insertUser(process.env.USERS_TABLE,
      firstName, lastName, emailAddress, userRole, apiKey, userEnabled);

    // Mark the last change to now
    await configUtils.setLastChangeTimestampToNow(process.env.CONFIG_TABLE);

    return requestUtils.buildSuccessfulResponse({
      userId: userId
    });
  }
  catch (error)
  {
    console.log('[ERROR] failed to create user', error);
    return requestUtils.buildErrorResponse(error);
  }
};

