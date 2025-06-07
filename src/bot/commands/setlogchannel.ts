import { 
  SlashCommandBuilder, 
  CommandInteraction, 
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
  EmbedBuilder
} from 'discord.js';
import { MiraClient } from '../client';
import { Command } from './commandHandler';
import { logger } from '../../utils/logger';
import { database } from '../../database/database';

const setlogchannel: Command = {
  data: new SlashCommandBuilder()
    .setName('setlogchannel')
    .setDescription('Set the channel for action logs')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to send action logs to (leave empty to disable)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildNews)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,
  
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute(interaction: CommandInteraction, client: MiraClient) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    const channel = interaction.options.get('channel')?.channel as TextChannel | null;
    const serverId = interaction.guild.id;

    try {
      // Get current server settings
      const server = await client.getGuildSettings(serverId);
      if (!server) {
        await interaction.reply({ content: '❌ Server configuration not found.', ephemeral: true });
        return;
      }

      // Update the log channel
      const previousChannel = server.settings.moderationLogChannel;
      
      if (channel) {
        // Check if bot has permission to send messages in the channel
        const permissions = channel.permissionsFor(client.user!);
        if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
          await interaction.reply({ 
            content: '❌ I don\'t have permission to send messages in that channel. Please grant me View Channel, Send Messages, and Embed Links permissions.', 
            ephemeral: true 
          });
          return;
        }

        server.settings.moderationLogChannel = channel.id;
        
        // Send a test message to the new log channel
        const testEmbed = new EmbedBuilder()
          .setTitle('✅ Action Logging Enabled')
          .setDescription(`This channel will now receive logs for all token actions performed in **${interaction.guild.name}**.`)
          .setColor(0x00ff00)
          .addFields(
            { name: 'Configured By', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
          )
          .setFooter({ text: 'Robotic Policeman • Action Logger' })
          .setTimestamp();

        await channel.send({ embeds: [testEmbed] });
      } else {
        // Disable logging
        server.settings.moderationLogChannel = undefined;
      }

      // Save the updated settings
      await database.updateServerSettings(serverId, {
        moderationLogChannel: channel ? channel.id : undefined
      });

      // Send confirmation
      const confirmEmbed = new EmbedBuilder()
        .setTitle(channel ? '✅ Log Channel Updated' : '🔕 Logging Disabled')
        .setColor(channel ? 0x00ff00 : 0xff0000)
        .setTimestamp();

      if (channel) {
        confirmEmbed.setDescription(`Action logs will now be sent to ${channel}.`);
        if (previousChannel && previousChannel !== channel.id) {
          confirmEmbed.addFields({ 
            name: 'Previous Channel', 
            value: `<#${previousChannel}>`, 
            inline: true 
          });
        }
      } else {
        confirmEmbed.setDescription('Action logging has been disabled.');
        if (previousChannel) {
          confirmEmbed.addFields({ 
            name: 'Previous Channel', 
            value: `<#${previousChannel}>`, 
            inline: true 
          });
        }
      }

      await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

      logger.info(`Log channel ${channel ? `set to ${channel.id}` : 'disabled'} for guild ${serverId} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error('Error setting log channel:', error);
      await interaction.reply({ 
        content: '❌ An error occurred while setting the log channel.', 
        ephemeral: true 
      });
    }
  }
};

export default setlogchannel; 