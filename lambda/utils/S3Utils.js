// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const AWS = require('aws-sdk')
const s3 = new AWS.S3();

/**
 * Puts an object into S3
 */
module.exports.putObject = async(bucket, key, content) =>
{
  try
  {
    const params =
    {
      Bucket: bucket,
      Key: key,
      Body: content
    };
    await s3.putObject(params).promise();
  }
  catch (error)
  {
    console.error('Failed to put object to S3', error);
    throw error;
  }
};

/**
 * Fetches an object from S3
 */
module.exports.getObject = async (bucket, key) =>
{
  try
  {
    const params =
    {
      Bucket: bucket,
      Key: key
    };

    var response = await s3.getObject(params).promise();
    return response.Body.toString('utf-8');
  }
  catch (error)
  {
    console.error('Failed to get object from S3', error);
    throw error;
  }
};

/**
 * Fetches a presigned url for the requested object
 */
module.exports.getPresignedUrl = (bucket, key, expirySeconds = 5 * 60) =>
{
  return s3.getSignedUrl("getObject", {
    Bucket: bucket,
    Key: key,
    Expires: expirySeconds
  });
};

