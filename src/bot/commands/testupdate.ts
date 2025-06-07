import { 
  SlashCommandBuilder, 
  CommandInteraction,
  PermissionFlagsBits,
  TextChannel
} from 'discord.js';
import { MiraClient } from '../client';
import { Command } from './commandHandler';
import { logger } from '../../utils/logger';
import { adaptiveEconomyService } from '../../services/adaptiveEconomyService';

const testupdate: Command = {
  data: new SlashCommandBuilder()
    .setName('testupdate')
    .setDescription('Test command to trigger price updates (Owner only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('messageid')
        .setDescription('Message ID of a control panel to update')
        .setRequired(false)
    )
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel containing the control panel')
        .setRequired(false)
    ) as SlashCommandBuilder,
  
  ownerOnly: true,
  guildOnly: true,

  async execute(interaction: CommandInteraction, client: MiraClient) {
    await interaction.deferReply({ ephemeral: true });

    try {
      let report = '**Test Update Report**\n\n';
      
      // Check if manual message update was requested
      const messageId = interaction.options.get('messageid')?.value as string;
      const channel = interaction.options.get('channel')?.channel as TextChannel;
      
      if (messageId && channel) {
        report += `🔧 **Manual Message Update Test**\n`;
        try {
          const message = await channel.messages.fetch(messageId);
          if (message && message.author.id === client.user?.id) {
            // Get updated embeds
            const embeds = await client.controlPanelManager.createUpdatedEmbeds(interaction.guild!.id);
            await message.edit({ embeds });
            report += `✅ Successfully updated message ${messageId}\n\n`;
          } else {
            report += `❌ Message not found or not from bot\n\n`;
          }
        } catch (error) {
          report += `❌ Error updating message: ${error}\n\n`;
        }
      }
      
      // Check how many panels are registered
      const panelCount = client.controlPanelManager.getTotalPanelCount();
      report += `📊 **Control Panels Registered:** ${panelCount}\n`;
      
      // Get debug info about panels
      const panelDebug = client.controlPanelManager.getDebugInfo();
      report += `\n📋 **Panel Details:**\n\`\`\`\n${panelDebug}\`\`\`\n`;
      
      // Check loaded commands
      report += `\n📋 **Loaded Commands:** ${client.commands.size}\n`;
      report += `Commands: ${Array.from(client.commands.keys()).join(', ')}\n`;
      
      // Trigger price update
      report += `\n🔄 **Triggering Price Update...**\n`;
      await adaptiveEconomyService.updateAllServerPrices();
      report += `✅ Price update complete\n`;
      
      // Trigger panel update
      report += `\n🔄 **Triggering Panel Update...**\n`;
      await client.controlPanelManager.updateAllPanels();
      report += `✅ Panel update complete\n`;
      
      // Get current prices for this server
      const server = await client.getGuildSettings(interaction.guild!.id);
      if (server) {
        report += `\n💰 **Current Prices:**\n`;
        const { DEFAULT_ACTIONS } = await import('../../database/models');
        for (const action of DEFAULT_ACTIONS) {
          if (server.settings.enabledActions.includes(action.id)) {
            const price = server.settings.actionPrices[action.id] || action.defaultPrice;
            report += `• ${action.name}: ${price.toLocaleString()} tokens\n`;
          }
        }
      }
      
      await interaction.editReply(report);
    } catch (error) {
      logger.error('Error in testupdate command:', error);
      await interaction.editReply(`❌ Error: ${error}`);
    }
  }
};

export default testupdate; 