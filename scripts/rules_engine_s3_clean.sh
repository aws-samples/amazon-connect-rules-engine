#!/bin/bash

set -e

date

source ./env/$1.sh

echo "Cleaning Rules engine S3 for $1"

./scripts/rules_engine_check_aws_account.sh

s3Bucket="s3://${stage}-${service}-site-${region}-${accountNumber}/"

aws s3 rm --recursive $s3Bucket

