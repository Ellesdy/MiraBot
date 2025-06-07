import { Events, Interaction } from 'discord.js';
import { MiraClient } from '../client';
import { logger } from '../../utils/logger';
import { Event } from './eventHandler';

const interactionCreate: Event = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    const client = interaction.client as MiraClient;

    try {
      if (interaction.isChatInputCommand()) {
        await client.commandHandler.handleCommand(interaction);
      } else if (interaction.isAutocomplete()) {
        await client.commandHandler.handleAutocomplete(interaction);
      } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
        // Handle button and select menu interactions
        // This could be extended for action selection menus
        logger.debug(`Component interaction: ${interaction.customId}`);
      }
    } catch (error) {
      logger.error('Error handling interaction:', error);
      
      try {
        const errorMessage = 'There was an error processing your interaction!';
        
        if (interaction.isRepliable()) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
      } catch (followUpError) {
        logger.error('Error sending error message:', followUpError);
      }
    }
  },
};

export default interactionCreate; 