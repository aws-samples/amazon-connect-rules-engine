

const expect = require('chai').expect;
const config = require('./utils/config');
const connectUtils = require('../lambda/utils/ConnectUtils');

describe('PromptsMapTest', function() {
    this.beforeAll(function () {
      config.loadEnv();
    });

    it('Should escape all non-alpha numeric with underscore', async function() {
      var promptsList = [
        {
          Name: 'Simple-Wav%20;With_Spaces&Stuff (Nuts).wav',
          Id: 'eb6a445c-d707-11ec-94ff-f731421e444e',
          Arn: 'Some arn'
        }
      ];

      var promptsMap = connectUtils.getPromptsMap(promptsList);

      console.info(JSON.stringify(promptsMap, null, 2));

      expect(promptsMap['Simple_Wav_20_With_Spaces_Stuff__Nuts__wav'].id).to.equal('eb6a445c-d707-11ec-94ff-f731421e444e');
      expect(promptsMap['Simple_Wav_20_With_Spaces_Stuff__Nuts__wav'].arn).to.equal('Some arn');
    });

});
