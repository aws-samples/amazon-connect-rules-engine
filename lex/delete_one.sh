#!/bin/bash

set -e

# Load the shared environment
source ../env/$2.sh

../scripts/rules_engine_check_aws_account.sh

npm install

echo "[INFO] deleting bot: $1"
node delete_lex_bot.js $1
