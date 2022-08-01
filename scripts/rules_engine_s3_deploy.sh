#!/bin/bash

set -e

date

source ./env/$1.sh

echo "Deploying Rules engine to S3 for $1"

./scripts/rules_engine_check_aws_account.sh

s3Bucket="s3://${stage}-${service}-site-${region}-${accountNumber}/"

echo "Describing the stack and building web config"

aws cloudformation --region "${region}" describe-stacks \
  --stack-name "${stage}-${service}" \
  --query "Stacks[0].Outputs[?OutputKey=='SiteConfigTemplate'].OutputValue" \
  --output text > web/config/site_config.json

cd web/

echo "Deploying web assets to bucket: $s3Bucket"

aws s3 cp --recursive \
  --cache-control 'no-cache' \
  --exclude "*.DS_Store" \
  --exclude "Desktop.ini" \
  --exclude "desktop.ini" \
  --exclude "*.git" \
  --exclude "*.gitignore" \
  . $s3Bucket

echo "S3 deployment complete, site URL: "

aws cloudformation --region "${region}" describe-stacks \
  --stack-name "${stage}-${service}" \
  --query "Stacks[0].Outputs[?OutputKey=='WebsiteURL'].OutputValue" \
  --output text
