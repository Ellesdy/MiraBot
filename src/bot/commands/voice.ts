import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { MiraClient } from '../client';
import { Command } from './commandHandler';

const voice: Command = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Check your voice activity stats and earnings')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check voice stats for (leave empty for yourself)')
        .setRequired(false)
    ) as SlashCommandBuilder,
  
  guildOnly: true,
  cooldown: 5,

  async execute(interaction: CommandInteraction, client: MiraClient) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const targetUser = chatInteraction.options.getUser('user') || interaction.user;
    const isOwner = client.isOwner(interaction.user.id);
    const isServerAdmin = await client.isServerAdmin(interaction.user.id, interaction.guild!.id);
    
    // Only allow checking other users' stats if you're an admin or owner
    if (targetUser.id !== interaction.user.id && !isOwner && !isServerAdmin) {
      await interaction.reply({
        content: 'You can only check your own voice activity unless you\'re a server administrator.',
        ephemeral: true
      });
      return;
    }

    try {
      const voiceStats = await client.voiceActivityManager.getUserVoiceStats(
        targetUser.id, 
        interaction.guild!.id
      );

      const serverSettings = await client.getGuildSettings(interaction.guild!.id);
      const tokensPerMinute = serverSettings?.settings.voiceTokensPerMinute || 1;
      const voiceRewardsEnabled = serverSettings?.settings.voiceActivityRewards || false;

      const embed = new EmbedBuilder()
        .setTitle(`🎤 ${targetUser.username}'s Voice Activity`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setColor(voiceStats.isActive ? 0x00ff00 : 0x888888)
        .setTimestamp();

      if (!voiceRewardsEnabled) {
        embed.setDescription('⚠️ Voice activity rewards are currently disabled on this server.');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const currentSessionTokens = voiceStats.currentSessionMinutes * tokensPerMinute;
      const todayTokens = voiceStats.todayMinutes;

      embed.addFields(
        {
          name: '🔴 Current Session',
          value: voiceStats.isActive 
            ? `**${voiceStats.currentSessionMinutes} minutes** active\n` +
              `Earned: **${currentSessionTokens}** tokens this session`
            : 'Not currently in voice',
          inline: true
        },
        {
          name: '📊 Today\'s Activity',
          value: `**${voiceStats.todayMinutes} tokens** earned today\n` +
                 `${Math.floor(voiceStats.todayMinutes / tokensPerMinute)} minutes in voice`,
          inline: true
        },
        {
          name: '⚙️ Server Settings',
          value: `**${tokensPerMinute} token${tokensPerMinute !== 1 ? 's' : ''}** per minute\n` +
                 `Voice rewards: ${voiceRewardsEnabled ? '✅ Enabled' : '❌ Disabled'}`,
          inline: true
        }
      );

      if (voiceStats.isActive) {
        embed.addFields({
          name: '💡 Earning Tips',
          value: '• Stay in voice channels to earn tokens continuously\n' +
                 '• Tokens are awarded every minute you\'re active\n' +
                 '• Use `/purchase` to buy additional tokens with real money',
          inline: false
        });
      } else {
        embed.addFields({
          name: '💡 How to Earn Tokens',
          value: '• Join any voice channel to start earning\n' +
                 '• Earn tokens automatically while you chat\n' +
                 '• Use `/purchase` to buy tokens instantly',
          inline: false
        });
      }

      const footer = voiceStats.isActive 
        ? 'You\'re currently earning tokens!' 
        : 'Join a voice channel to start earning';
      
      embed.setFooter({ text: footer });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error in voice command:', error);
      await interaction.reply({
        content: 'There was an error retrieving voice activity stats. Please try again.',
        ephemeral: true
      });
    }
  },
};

export default voice; 