#!/bin/bash

set -e

failuresDetected=0

recordError()
{
  echo "[ERROR] detected a failure building bot: $1, continuing"
  failuresDetected=$((failuresDetected+1))
}

# Load the shared environment
source ../env/$1.sh

../scripts/rules_engine_check_aws_account.sh

npm install

for i in ./bots/*.json; do
  echo "[INFO] Building bot: $i"
  node deploy_lex_bot.js $i || recordError $i
done

if [[ "$failuresDetected" -gt 0 ]]; then
  echo "[ERROR] recorded $failuresDetected failures!"
  exit 1
fi
