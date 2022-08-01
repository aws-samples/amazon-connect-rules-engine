#!/bin/bash

set -e

date

echo "Checking AWS account number matches configured environment..."
localAccountNumber=$(aws sts get-caller-identity --query "Account" --output text)
if [ "$localAccountNumber" == "$accountNumber" ]; then
    echo "Verified deployment AWS account number matches credentials, proceeding!"
    exit 0
else
    echo "Found mismatched AWS account number in credentials, was expecting: ${accountNumber} found: ${localAccountNumber} check credentials!"
    exit 1
fi
