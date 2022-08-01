// Import lambda funcion

const expect = require("chai").expect;
const AWSMock = require('aws-sdk-mock');
const config = require('./utils/config.js');
const lambda = require('../lambda/VerifyLogin.js').handler;
const dynamoUtils = require('../lambda/utils/DynamoUtils.js');
const dynamoTableMocker = require('./utils/DynamoTableDataMocker.js');
const mockEventGenerator = require('./utils/MockEventGenerator.js');

describe('VerifyLoginTests', function() {
    this.beforeAll(function () {
        config.loadEnv();
        dynamoTableMocker.setupMockDynamo(AWSMock, dynamoUtils);
    });
    
    it('should accept a valid api key', async function() {
        var event = mockEventGenerator.generateVerifyLoginMockdata("1a123456-ab12-1a2a-1c23-b123456ef789");
        var data = await lambda(event, null, function (err, data) {if (err) throw err; else return data;});
        var body = JSON.parse(data.body);
        expect(body.user.userId).to.equal("19b1dc36-3ad6-11ec-97b9-b124ea8f11eb");      
        expect(data.statusCode).to.equal(200);   
    });

    it('should not accept an invalid api key', async function() {
        var event = mockEventGenerator.generateVerifyLoginMockdata("1a222222-ff11-1e1a-1c11-b111111ef111");
        var data = await lambda(event, null, function (err, data) {if (err) throw err; else return data;});
        var body = JSON.parse(data.body);
        expect(body.user).to.equal(undefined);     
        expect(data.statusCode).to.equal(401);  
    });

    this.afterAll(function () {
        AWSMock.restore('DynamoDB');
    })
});
