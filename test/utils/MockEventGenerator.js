// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 *  This file should be used to generate mock events to lambda functions
 *
 *  TODO make more generic -> many constants below, headers, multi val headers
 *  Main changers requestContext and potentially Identity depending on the test case
 */

/**
 *
 * @param {*} apiKey
 * @returns generated mock event for a lambda function using apikey
 */
module.exports.generateVerifyLoginMockdata = function(apiKey){
    return {
        "resource": "/rulesengine/login",
        "path": "/rulesengine/login",
        "httpMethod": "POST",
        "headers": {
            "accept": "application/json, text/plain, /",
            "accept-encoding": "gzip, deflate, br",
            "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
            "content-type": "application/json;charset=UTF-8",
            "Host": "unit-testing-aws.execute-api.ap-southeast-2.amazonaws.com",
            "origin": "https://unit-testing-aws.cloudfront.net",
            "referer": "https://unit-testing-aws.cloudfront.net/",
            "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"96\", \"Google Chrome\";v=\"96\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "cross-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
            "x-api-key": apiKey,
            "X-Forwarded-Port": "443",
            "X-Forwarded-Proto": "https"
        },
        "multiValueHeaders": {
            "accept": [
                "application/json, text/plain, /"
            ],
            "accept-encoding": [
                "gzip, deflate, br"
            ],
            "accept-language": [
                "en-GB,en-US;q=0.9,en;q=0.8"
            ],
            "content-type": [
                "application/json;charset=UTF-8"
            ],
            "Host": [
                "unit-testing-aws.execute-api.ap-southeast-2.amazonaws.com"
            ],
            "origin": [
                "https://unit-testing-aws.cloudfront.net"
            ],
            "referer": [
                "https://unit-testing-aws.cloudfront.net/"
            ],
            "sec-ch-ua": [
                "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"96\", \"Google Chrome\";v=\"96\""
            ],
            "sec-ch-ua-mobile": [
                "?0"
            ],
            "sec-ch-ua-platform": [
                "\"Windows\""
            ],
            "sec-fetch-dest": [
                "empty"
            ],
            "sec-fetch-mode": [
                "cors"
            ],
            "sec-fetch-site": [
                "cross-site"
            ],
            "User-Agent": [
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
            ],
            "X-Amzn-Trace-Id": [

            ],
            "x-api-key": [
                apiKey
            ],
            "X-Forwarded-For": [

            ],
            "X-Forwarded-Port": [
                "443"
            ],
            "X-Forwarded-Proto": [
                "https"
            ]
        },
        "queryStringParameters": null,
        "multiValueQueryStringParameters": null,
        "pathParameters": null,
        "stageVariables": null,
        "requestContext": {
            "resourceId": "sc08x2",
            "resourcePath": "/rulesengine/login",
            "httpMethod": "POST",
            "extendedRequestId": "",
            "requestTime": "20/Dec/2021:22:40:55 +0000",
            "path": "/dev/rulesengine/login",
            "protocol": "HTTP/1.1",
            "stage": "dev",
            "domainPrefix": "unit-testing-aws",
            "requestTimeEpoch": 1640040055386,
            "requestId": "d13ae99e-9666-4a75-af29-663852aac166",
            "identity": {
                "cognitoIdentityPoolId": null,
                "cognitoIdentityId": null,
                "apiKey": apiKey,
                "principalOrgId": null,
                "cognitoAuthenticationType": null,
                "userArn": null,
                "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
                "accountId": null,
                "caller": null,
                "accessKey": null,
                "cognitoAuthenticationProvider": null,
                "user": null
            },
            "domainName": "unit-testing-aws.execute-api.ap-southeast-2.amazonaws.com",
            "apiId": "unit-testing-aws"
        },
        "body": "{}",
        "isBase64Encoded": false
      }
}
