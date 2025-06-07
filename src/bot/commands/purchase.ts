import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import { MiraClient } from '../client';
import { Command } from './commandHandler';
import { config } from '../../utils/config';

const purchase: Command = {
  data: new SlashCommandBuilder()
    .setName('purchase')
    .setDescription('Purchase tokens with real money'),
  
  guildOnly: false,
  cooldown: 5,

  async execute(interaction: CommandInteraction, client: MiraClient) {
    try {
      const dashboardUrl = config.dashboard.url;
      
      const embed = new EmbedBuilder()
        .setTitle('🛒 Purchase MIRA Tokens')
        .setDescription(
          `Purchase tokens securely through our dashboard!\n\n` +
          `**Click the link below to:**\n` +
          `• Sign in with Discord\n` +
          `• View token packages\n` +
          `• Pay with credit card or cryptocurrency\n` +
          `• Get instant token delivery\n\n` +
          `**[Purchase Tokens →](${dashboardUrl}/purchase)**\n\n` +
          `💡 **Earn Free Tokens:**\n` +
          `Join any voice channel to earn 1 token per minute!`
        )
        .setColor(0x00ff00)
        .setFooter({ text: 'Secure payments • Instant delivery • Multiple payment methods' })
        .setTimestamp();

      await interaction.reply({ 
        embeds: [embed], 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Error in purchase command:', error);
      await interaction.reply({
        content: 'There was an error loading the purchase link. Please try again.',
        ephemeral: true
      });
    }
  },
};

export default purchase; 