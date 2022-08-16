#!/bin/bash

# ------------------------------------------------
#
# !README!
#
# Copy this file and name it dev.sh or something
# that matches your stage below
#
# Replace TBA with valid values for your environment
#
# ------------------------------------------------

# Change to test, uat, prod etc
export stage=dev

# Should not need to change
export service=rules-engine

# The name of your enviroment shown in the site banner
export environmentName="TBA $stage"

# Target AWS deployment region
export region=ap-southeast-2

# AWS account number
export accountNumber=TBA

# Amazon Connect Instance Id
export instanceId=TBA

# Lex bot locale for inferencing (must match deployed bot settings)
export botLocaleId=en_AU

# Polly settings during interactive inferencing
export voiceId=Olivia
export voiceLanguage=en-AU

# Batch size for batch testing concurrency
export batchSize=10

# ------------------------------------------------
#
# !README!
#
# If required, specify a local named AWS profile to use
# and uncomment these lines.
#
# This will be used by the AWS CLI and Node.js deployment helpers.
#
# Alternatively, export AWS credentials through your CICD
# tooling or do nothing if running with an IAM role context
# (for example from a CodeBuild job)
#
# ------------------------------------------------

# export profile=TBA
# export AWS_PROFILE=$profile

# Amazon Connect Instance ARN
export instanceArn="arn:aws:connect:${region}:${accountNumber}:instance/${instanceId}"

# S3 bucket to upload deployment assets to
export deploymentBucket="${stage}-${service}-deployment-${accountNumber}"

# Lex conversational logs bucket (created during serverless deployment)
export conversationalLogsBucketArn="arn:aws:s3:::${stage}-${service}-lex-${region}-${accountNumber}"

# Lex role (created during serverless deployment)
export lexRoleArn="arn:aws:iam::${accountNumber}:role/${stage}-${service}-${region}-lexrole"

echo "Exported $environmentName"
