#!/bin/bash

set -e

date

source ./env/$1.sh

echo 'Creating deployment bucket for $1'

./scripts/rules_engine_check_aws_account.sh

aws s3 mb \
  --region ${region} \
  s3://${stage}-${service}-deployment-${accountNumber}
