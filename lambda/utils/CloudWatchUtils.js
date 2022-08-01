// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

var AWS = require('aws-sdk');
AWS.config.update({region: process.env.REGION});
var cloudWatch = new AWS.CloudWatch();

/**
 * Records a cloud watch custom metric
 */
module.exports.putMetricData = async function(stage, namespace, metricName, metricValue)
{
  try
  {
    var metrics = [];

    metrics.push({
      'MetricName': metricName,
      'Dimensions': [{
        'Name': 'Environment',
        'Value': stage
      }],
      'Unit': 'Count',
      'Value': +metricValue
    });

    var putMetricsRequest = {
      Namespace: namespace,
      MetricData: metrics
    };

    await cloudWatch.putMetricData(putMetricsRequest).promise();
  }
  catch (error)
  {
    console.log('[ERROR] failed to put CloudWatch metrics', error);
    throw error;
  }
}
