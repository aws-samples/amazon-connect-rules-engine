set -e

date

source ./env/$1.sh

echo "Extracting contact flows for $environmentName"

./scripts/rules_engine_check_aws_account.sh

mkdir -p ./temp

echo "Listing contact flows"
aws connect list-contact-flows \
  --instance-id ${instanceId} \
  --region ${region} \
  --contact-flow-types 'CONTACT_FLOW' 'AGENT_WHISPER' 'CUSTOMER_HOLD' 'CUSTOMER_QUEUE' 'CUSTOMER_WHISPER' 'OUTBOUND_WHISPER' > ./temp/contact_flows.json

echo "Preparing contact flow fix data"
node ./scripts/rules_engine_prepare_fixes.js ./temp/fixes.json

process_contactflow () {

  contactFlowName=$1
  echo ------------------------------------------
  echo "Processing contact flow: $contactFlowName"

  rawOutputFile1=./temp/${contactFlowName}_raw1.json
  rawOutputFile2=./temp/${contactFlowName}_raw2.json
  finalOutputFile=./connect/contactflows/${contactFlowName}.json
  contactFlowId=$(cat ./temp/contact_flows.json | jq -r ".ContactFlowSummaryList | map(select(.Name == (\"${contactFlowName}\")).Id) | .[]" )

  aws connect describe-contact-flow \
    --instance-id $instanceId \
    --region $region \
    --contact-flow-id ${contactFlowId} > ${rawOutputFile1}

  cat ${rawOutputFile1} | jq -r ".ContactFlow.Content" > ${rawOutputFile2}

  cat ${rawOutputFile2} | jq -r "" > ${finalOutputFile}

  node ./scripts/rules_engine_filter_flows.js ./temp/fixes.json ${finalOutputFile}

  echo "Processed contact flow: $contactFlowName"
}

# process_contactflow "empty_customer_whisper_flow"
# process_contactflow "empty_agent_whisper_flow"
# process_contactflow "empty_customer_hold_flow"
# process_contactflow "empty_customer_queue_flow"
# process_contactflow "empty_outbound_whisper_flow"
process_contactflow "RulesEngineAgentWhisper"
process_contactflow "RulesEngineCustomerHold"
process_contactflow "RulesEngineCustomerQueue"
process_contactflow "RulesEngineCustomerWhisper"
process_contactflow "RulesEngineOutboundWhisper"
process_contactflow "RulesEngineBootstrap"
process_contactflow "RulesEngineMain"
process_contactflow "RulesEngineDisconnect"
process_contactflow "RulesEngineError"
process_contactflow "RulesEngineDTMFMenu"
process_contactflow "RulesEngineDTMFInput"
process_contactflow "RulesEngineExternalNumber"
process_contactflow "RulesEngineIntegration"
process_contactflow "RulesEngineMessage"
process_contactflow "RulesEngineNLUInput"
process_contactflow "RulesEngineNLUMenu"
process_contactflow "RulesEngineQueue"
process_contactflow "RulesEngineRuleSet"
process_contactflow "RulesEngineSMSMessage"
process_contactflow "RulesEngineTerminate"
process_contactflow "RulesEngineWait"
