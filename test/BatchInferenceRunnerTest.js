
const expect = require('chai').expect;

/**
 * Tests batch size logic
 */
describe('BatchInferenceRunnerTest', function()
{

  it('Test batch size logic', async function() {

    var batchSize = 3;
    var testIds = [
      '1', '2', '3', '4', '5', '6', '7', '8'
    ];

    var testResults = [];

    var startIndex = 0;

    var batchCount = 0;

    while (startIndex < testIds.length)
    {
      var endIndex = Math.min(testIds.length, startIndex + batchSize);

      var batchTestIds = testIds.slice(startIndex, endIndex);

      console.info('Got batch test ids: ' + JSON.stringify(batchTestIds, null, 2));

      // Start executing each test and keep the promises aside
      for (var i = 0; i < batchTestIds.length; i++)
      {
        var testId = batchTestIds[i];

        testResults.push(testId);
      }

      batchCount++;
      startIndex += batchSize;
    }

    expect(testResults.length).to.equal(testIds.length);
    expect(batchCount).to.equal(3);
  });

});

