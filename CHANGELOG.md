# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.7.1] - 2022-06-23

- Initial public release preparation
- Delayed contact attributes write
- SONAR code fixes
- AWS Open Source preparation

## [2.7.6] - 2022-06-28

- DTMFMenu rule refactoring
- Discontinuous menu options
- Configurable input attempts
- Separated routing logic for NOINPUT and NOMATCH error slots
- Moved logic for DTMF menu to ConnectDTMFMenu
- Bug fixes to interactive queue test scripts
- 100% test coverage for ConnectDTMFMenu

## [2.7.8] - 2022-07-16

- DTMFMenu blue arrow links restored
- SetAttributes allows empty attribute values
- SetAttributes deletes attributes will null or undefined string values

## [2.7.9] - 2022-07-19

- KeepWarm Lambda function and supporting code to keep functions warm
- Support for keeping the following functions warm:
  - ConnectRulesInference
  - ConnectIntegrationStart
  - InferenceAPI
- Cached Lambda functions in config now look wider with prefix `stage-service-`
- Increased memory on ConnectDTMFMenu as a common Lambda function that could be accelerated
- Upgraded moment version per dependabot
- Added sample insert of keep warm config for dev
- Added insert of keep warm to rules_engine_serverless_deploy.sh (dev only currently)

## [2.8.0] - 2022-07-21

- Lambda functions given more memory to boost performance
- Lex bots support changing target vocie and language during inferencing
- Polly output languages and voice support is now configurable in env/[env].sh
- Removed outbound call and repair lambda function functions
- ContactId written into System per interactive inference

## [2.8.2] - 2022-07-22

- Lex bots add support for slots with parent built in types
- ConnectDTMFMenu now logs contact id
- ConnectDTMFMenuTests fixes
- Added EXTENDING.md with details on implementing integration Lambda functions

## [2.8.3] - 2022-07-26

- Batch size for test execution defaults to 10 concurrent tests

## [3.0.0] - 2022-08-01

- Initial public release code base

## [3.0.1] - 2022-08-02

- Combined delete functions

