import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import { MiraClient } from '../client';
import { Command } from './commandHandler';
import { DEFAULT_ACTIONS } from '../../database/models';

const actions: Command = {
  data: new SlashCommandBuilder()
    .setName('actions')
    .setDescription('View all available token actions and their costs'),
  
  guildOnly: true,
  cooldown: 10,

  async execute(interaction: CommandInteraction, client: MiraClient) {
    try {
      const server = await client.getGuildSettings(interaction.guild!.id);
      const userTokens = await client.tokenManager.getUserTokens(interaction.user.id);
      
      if (!server) {
        await interaction.reply({
          content: 'Server configuration not found. Please contact an administrator.',
          ephemeral: true
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🛒 Available Token Actions')
        .setDescription(`Your current balance: **${userTokens.toLocaleString()}** tokens\n\n💡 **Tip:** Use \`/controlpanel\` for an interactive control panel with all features!`)
        .setColor(0x0099ff)
        .setFooter({ text: 'Use /use to perform an action • Try /controlpanel for more!' })
        .setTimestamp();

      // Group actions by category
      const categories = {
        'moderation': { name: '🔨 Moderation Actions', actions: [] as any[] },
        'fun': { name: '🎉 Fun Actions', actions: [] as any[] },
        'utility': { name: '🔧 Utility Actions', actions: [] as any[] }
      };

      for (const action of DEFAULT_ACTIONS) {
        if (server.settings.enabledActions.includes(action.id)) {
          const cost = server.settings.actionPrices[action.id] || action.defaultPrice;
          const cooldown = server.settings.cooldowns[action.id] || action.cooldown;
          const cooldownMinutes = Math.floor(cooldown / 60000);
          
          const canAfford = userTokens >= cost;
          const emoji = canAfford ? '✅' : '❌';
          
          const actionText = `${emoji} **${action.name}** - ${cost} tokens\n` +
                           `${action.description}\n` +
                           `*Cooldown: ${cooldownMinutes} minutes*`;
          
          categories[action.category].actions.push(actionText);
        }
      }

      // Add each category with actions to the embed
      for (const category of Object.values(categories)) {
        if (category.actions.length > 0) {
          embed.addFields({
            name: category.name,
            value: category.actions.join('\n\n'),
            inline: false
          });
        }
      }

      // Add usage instructions
      embed.addFields({
        name: '📖 How to Use',
        value: '• Use `/use <action> <target>` to perform an action\n' +
               '• Actions on cooldown cannot be used until the time expires\n' +
               '• You cannot target users with equal or higher roles\n' +
               '• Server owners and bot owners cannot be targeted',
        inline: false
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error in actions command:', error);
      await interaction.reply({
        content: 'There was an error retrieving the actions list. Please try again.',
        ephemeral: true
      });
    }
  },
};

export default actions; 