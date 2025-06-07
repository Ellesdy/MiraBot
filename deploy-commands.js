// Manual command deployment script
const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  // Add all your commands here
  {
    name: 'controlpanel',
    description: 'Open the payment terminal - I mean, control panel'
  },
  {
    name: 'setcontrolpanel',
    description: 'Place a public control panel in a channel (Admin only)',
    options: [{
      name: 'channel',
      description: 'The channel to place the control panel in',
      type: 7, // CHANNEL type
      required: true,
      channel_types: [0] // GUILD_TEXT
    }],
    default_member_permissions: '8' // ADMINISTRATOR
  },
  {
    name: 'testupdate',
    description: 'Test command to trigger price updates (Owner only)',
    default_member_permissions: '8' // ADMINISTRATOR
  },
  {
    name: 'balance',
    description: 'Check your token balance'
  },
  {
    name: 'actions',
    description: 'View available actions and their prices'
  },
  {
    name: 'shares',
    description: 'View share market information',
    options: [
      {
        name: 'buy',
        description: 'Buy shares',
        type: 1, // SUB_COMMAND
        options: [{
          name: 'amount',
          description: 'Number of shares to buy',
          type: 4, // INTEGER
          required: true,
          min_value: 1
        }]
      },
      {
        name: 'sell',
        description: 'Sell shares',
        type: 1, // SUB_COMMAND
        options: [{
          name: 'amount',
          description: 'Number of shares to sell',
          type: 4, // INTEGER
          required: true,
          min_value: 1
        }]
      },
      {
        name: 'info',
        description: 'View share market information',
        type: 1 // SUB_COMMAND
      }
    ]
  },
  {
    name: 'shareholders',
    description: 'View the top shareholders'
  },
  {
    name: 'voice',
    description: 'Check your voice activity stats'
  },
  {
    name: 'purchase',
    description: 'Purchase tokens with real money (Coming soon)'
  },
  {
    name: 'setlogchannel',
    description: 'Set the channel for action logs (Admin only)',
    options: [{
      name: 'channel',
      description: 'The channel to send logs to',
      type: 7, // CHANNEL type
      required: true,
      channel_types: [0] // GUILD_TEXT
    }],
    default_member_permissions: '8' // ADMINISTRATOR
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // For global commands
    const data = await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})(); 