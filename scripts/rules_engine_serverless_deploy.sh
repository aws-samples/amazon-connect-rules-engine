#!/bin/bash

set -e

date

source ./env/$1.sh

echo "Deploying Rules engine to $environmentName"

./scripts/rules_engine_check_aws_account.sh

# Install serverless globally if required
#npm install -g serverless

# Install required packages
npm install

# Run unit tests
npm test

echo 'Unit tests passed'

echo 'Commencing full forced deploy, grab a cup of coffee, takes several minutes'

serverless deploy --force

echo "Inserting admin user into DynamoDB"

aws dynamodb put-item \
  --region "${region}" \
  --table-name "${stage}-${service}-users-ddb" \
  --item "file://data/users/${stage}-admin.json"

echo "Inserting timezone config data into DynamoDB"

aws dynamodb put-item \
  --region "${region}" \
  --table-name "${stage}-${service}-config-ddb" \
  --item file://data/timezone.json

if [ -f "data/keepwarm/${stage}-keepwarm.json" ]; then
  echo "Inserting keep warm config into DynamoDB"
  aws dynamodb put-item \
    --region "${region}" \
    --table-name "${stage}-${service}-config-ddb" \
    --item "file://data/keepwarm/${stage}-keepwarm.json"
else
  echo "Skipping inserting keep warm configuration due to missing file: data/keepwarm/${stage}-keepwarm.json"
fi

./scripts/rules_engine_s3_deploy.sh $1
