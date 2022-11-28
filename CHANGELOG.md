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

## [3.0.2] - 2022-08-10

- Functional NLUInput rule with support for date, time, number and phone
- Fixed minor issues in example.sh
- Added additional keep warm support
- Fixed issue in DeleteObject validation
- Removed Lex delete session as it isn't required

## [3.0.3] - 2022-08-17

- Fixed issue in NLU Menu preventing use in Connect

## [3.0.4] - 2022-08-17

- Support persisting huge batch test runs to S3

## [3.0.5] - 2022-08-23

- Refactored inference utils and common utils
- Added support for setting nested state from update states rule and other locations
- Removed dtmf selector, rule set bail and rule set prompt rules
- Added more test coverage for integration echo and common utils
- Added more tests for keep warm utils
- Refactored all sleep(), isNumber(), isEmptyString() and isNullOrUndefined() functions to common utils
- Added helper function render UTC date time time to millis to common utils

## [3.0.6] - 2022-08-24

- Updated readme with link to Summit on demand video
- Linked to slide deck for Summit presentation
- Updated help page content

## [3.0.7] - 2022-08-26

- Lex fulfilment Lambda that captures the full lex response to state

## [3.0.8] - 2022-08-30

- Text inference rule that can take text including the results from previous voice lex bots and perform additional inferencing

## [3.0.9] - 2022-08-31

- Text inference rule testing for interactive
- Text inference now uses fallback behaviour if no input is provided

## [3.0.10] - 2022-09-01

- NLUInput rule handling invalid inputs and prompting

## [3.0.11] - 2022-09-01

- NLU interactive rule components echo Lex API responses into debug response
- (Stop gap until LexV2 fulfilment Lambda request format bug is addressed by LexV2 service team)
- Fixed broken TextInferenceTest
- Add Lambda fulfillment function to TestBotAlias (delete existing S3 hashes for all bots to rebuild all)
- Delete lex bots (feature suggestion from SA community)

## [3.0.12] - 2022-09-06

- DynamoUtils.getTests() now loads multiple pages of tests
- Lex deploy now updates existing bot locales to take into account confidence changes etc

## [3.0.13] - 2022-09-08

- NLUMenu confidence levels for auto accept, back end refactoring and unit testing
- Added textInference capability to ConnectRulesEngine

## [3.0.14] - 2022-09-09

- Added external number return and DTMF tones
- Made interactive support external number return
- Added blue chevron links to NLUMenu editor
- Start of NLUInput data validation
- Copied nluConfidence to lex repsonse sesionState in customer state
- Defaulted to zero until lex service fix

## [3.0.15] - 2022-09-10

- NLUInput slot validation based on data type
- Fixed NLUMenu bug which caused errors if Connect conformation was required

## [3.0.16] - 2022-09-12

- Beefed up phone number input via NLUInput by hijacking the input transcript
- Phone input now supports double, triple, hundred and thousand and skipps filler words.
- NLUINput now waits for up to 4000 millis so as to not interrupt slower customers while providing input like phone numbers and account numbers that may have extended pauses.

## [3.0.17] - 2022-09-14

### Fixed

- NLUInput not taking good phone numbers as input in interactive
- Renamed duplicate unit tests

## [3.0.18] - 2022-09-14

- NLUMenu no longer terminates on final error with missing error ruleset, just falls through

## [3.0.19] - 2022-09-19

### Changed

- DTMFInput added option to skip confirmation if confirmation message is empty
- Removed support for prompt based confirmation messages in DTMFINput

### Fixed

- ConnectRulesIntegration removed debug error messages from contact flow
- Delete holiday via DeleteObject now sets the last updated timestamp

## [3.0.20] - 2022-10-11

### Fixed

- Added support for mixed SSML error messages in input and menu controls in interactive

## [3.0.21] - 2022-10-12

### Changed

- Added chat support with guarding in several places
- NLUInput and NLUMenu contact flows support for chat
- Fixed LexFulfillment to handle chat session id not matching contact id

## [3.0.22] - 2022-10-14

### Added

- In queue treatments
- Customers will need to edit queue rules and migrate to in queue behaviours
- Failure to edit queue rules will result in repeating hold music

## [3.0.23] - 2022-10-20

### Fixed

- Loading huge batch results now defers to browser loading of results and coverage from pre-signed urls
- Added CORS to backup bucket to be able to load from pre-signed url
- Made customer queue loop prompts interrupt at 20 seconds per customer request

## [3.0.24] - 2022-10-24

### Fixed

- Fixed issue with increment in ConnectRulesInference and UpdateStates

## [3.0.25] - 2022-10-24

### Added

- Added select drop down for available promots to pick in message during queue behaviour editing

## [3.0.27] - 2022-10-27

### Fixed

- Update state queue behaviour did not use processed template value

## [3.0.28] - 2022-10-27

### Fixed

- Add queue behaviour modal now resets between uses

## [3.0.29] - 2022-10-28

### Enhancements

- Made SMS rule accept nested key paths to the input phone number


## [3.0.30] - 2022-11-28

### Enhancements

- New home page content
- New help content covering handlebars functions
- New dateFormaLocal handlebars helper function
- Soft deprecation of all handlebars date helper functions except dateFormat and dateFormatLocal, please move to these standard date formatting function asap!
