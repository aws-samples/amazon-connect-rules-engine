#!/bin/bash

set -e

date

source ./env/$2.sh

echo "Deployingfunction $1 to $2"

./scripts/rules_engine_check_aws_account.sh

# Run unit tests
npm test
echo 'Unit tests passed'

# TODO renable tests
# echo 'Skipping unit tests'

serverless deploy function -f "$1" --force
