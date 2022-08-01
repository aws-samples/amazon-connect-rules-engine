
var moment = require('moment');

const bots = 
[
  {
    id: 'VYM6Z4CSUQ',
    name: 'TestBot',
    status: 'Available',
    description: 'A test bot',
    intents: [
      {
        id: '9EAJSJFYKJ',
        name: 'Human',
        description: 'The user wants to speak to a person',
        utterances: [
          'Human',
          'Help',
          'Agent',
          'Talk to a human'
        ],
        updated: moment().subtract(3, 'hours').format(),
        status: 'Available',
        deployed: true
      },
      {
        id: 'IGMI1L3NZ3',
        name: 'Billing',
        utterances: [
        ],
        updated: moment().subtract(2, 'hours').format(),
        deployed: true
      }
    ],
    deployed: true,
    updated: moment().subtract(2, 'hours').format()
  },
  {
    id: 'e75d273a-2eea-4569-850e-f0f83ca38d66',
    name: 'FAQBot',
    description: 'A bot that powers FAQ matches',
    intents: [
      {
        id: 'ada2ee95-c9ae-43cb-8e43-b2dafa81a41d',
        name: 'Human',
        utterances: [
          'Human',
          'Help',
          'Agent',
          'Talk to a human'
        ],
        updated: moment().subtract(1, 'hours').format(),
        deployed: true
      },
      {
        id: 'b53b92e3-8364-4520-885b-ef7b77955eeb',
        name: 'Payments',
        utterances: [
          'How do I pay'
        ],
        updated: moment().subtract(1, 'hours').format(),
        deployed: false
      }
    ],
    deployed: false,
    updated: moment().format()
  }
];

/**
 * Fetches all bots
 */
module.exports.getMockBots = () => 
{
  return bots;
}

/**
 * Fetches a mock bot by id
 */
module.exports.getMockBot = (botId) => 
{
  var bot = bots.find(bot => bot.id === botId);

  if (bot === null)
  {
    throw new Error('Failed to find bot with id: ' + botId);
  }

  return bot;
}
