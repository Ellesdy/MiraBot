import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { MiraClient } from '../client';
import { Command } from './commandHandler';
import { database } from '../../database/database';
import { Transaction } from '../../database/models';

const balance: Command = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your token balance and statistics')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to check balance for (leave empty for yourself)')
        .setRequired(false)
    ) as SlashCommandBuilder,
  
  guildOnly: true,
  cooldown: 5,

  async execute(interaction: CommandInteraction, client: MiraClient) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const targetUser = chatInteraction.options.getUser('user') || interaction.user;
    const isOwner = client.isOwner(interaction.user.id);
    const isServerAdmin = await client.isServerAdmin(interaction.user.id, interaction.guild!.id);
    
    // Only allow checking other users' balance if you're an admin or owner
    if (targetUser.id !== interaction.user.id && !isOwner && !isServerAdmin) {
      await interaction.reply({
        content: 'You can only check your own balance unless you\'re a server administrator.',
        ephemeral: true
      });
      return;
    }

    try {
      const stats = await client.tokenManager.getUserStats(targetUser.id);
      const voiceStats = await client.voiceActivityManager.getUserVoiceStats(targetUser.id, interaction.guild!.id);
      
      const embed = new EmbedBuilder()
        .setTitle(`💰 ${targetUser.username}'s Token Balance`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setColor(0x00ff00)
        .addFields(
          { 
            name: '🪙 Current Balance', 
            value: `**${stats.tokens.toLocaleString()}** tokens`, 
            inline: true 
          },
          { 
            name: '📈 Total Earned', 
            value: `${stats.totalEarned.toLocaleString()} tokens`, 
            inline: true 
          },
          { 
            name: '📉 Total Spent', 
            value: `${stats.totalSpent.toLocaleString()} tokens`, 
            inline: true 
          },
          {
            name: '🎤 Voice Activity',
            value: voiceStats.isActive ? '🟢 Currently earning' : '⚫ Not in voice',
            inline: true
          }
        )
        .setFooter({ 
          text: `Use /voice to check activity • Use /purchase to buy tokens • Use /actions to spend` 
        })
        .setTimestamp();

      // Add transaction history for own balance
      if (targetUser.id === interaction.user.id) {
        const transactions = await database.getUserTransactions(targetUser.id, 5);
        if (transactions.length > 0) {
          const recentTransactions = transactions.slice(0, 3).map((tx: Transaction) => {
            const emoji = tx.type === 'earn' || tx.type === 'admin_add' ? '📈' : '📉';
            const amount = Math.abs(tx.amount);
            return `${emoji} ${tx.type === 'earn' || tx.type === 'admin_add' ? '+' : '-'}${amount} - ${tx.description}`;
          }).join('\n');
          
          embed.addFields({
            name: '📊 Recent Transactions',
            value: recentTransactions || 'No recent transactions',
            inline: false
          });
        }
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error in balance command:', error);
      await interaction.reply({
        content: 'There was an error retrieving the balance. Please try again.',
        ephemeral: true
      });
    }
  },
};

export default balance; 