#!/bin/bash

set -e

# Load the shared environment
source ../env/$2.sh

../scripts/rules_engine_check_aws_account.sh

npm install

echo "[INFO] Building bot: $1"
node deploy_lex_bot.js $1 $3
