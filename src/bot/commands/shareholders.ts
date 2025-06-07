import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import { MiraClient } from '../client';
import { Command } from './commandHandler';
import { database } from '../../database/database';

const shareholders: Command = {
  data: new SlashCommandBuilder()
    .setName('shareholders')
    .setDescription('View top shareholders and dividend information'),
  
  guildOnly: true,
  cooldown: 10,

  async execute(interaction: CommandInteraction, client: MiraClient) {
    try {
      const shareInfo = await client.shareManager.getShareInfo(interaction.guild!.id);
      
      if (!shareInfo.enabled) {
        await interaction.reply({
          content: '❌ Share system is not enabled on this server.',
          ephemeral: true
        });
        return;
      }
      
      const topShareholders = await client.shareManager.getTopShareholders(interaction.guild!.id, 10);
      const shareStats = await database.getServerShareStats(interaction.guild!.id);
      
      const embed = new EmbedBuilder()
        .setTitle('🏆 Top Shareholders')
        .setColor(0xffd700)
        .setThumbnail(interaction.guild!.iconURL() || '')
        .setDescription(
          `**Server:** ${interaction.guild!.name}\n` +
          `**Total Shares Sold:** ${shareStats.totalSharesSold}/${shareInfo.totalShares}\n` +
          `**Total Dividends Paid:** ${shareStats.totalDividendsPaid.toLocaleString()} tokens\n`
        );
      
      if (topShareholders.length === 0) {
        embed.addFields({
          name: 'No Shareholders',
          value: 'No one has purchased shares yet. Be the first investor!',
          inline: false
        });
      } else {
        // Add top shareholders
        const shareholderList = await Promise.all(
          topShareholders.slice(0, 10).map(async (holder, index) => {
            try {
              const user = await client.users.fetch(holder.userId);
              const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
              return `${medal} **${user.username}** - ${holder.shares} shares (${holder.percentage.toFixed(1)}%)\n` +
                     `   💵 Dividends earned: ${holder.totalDividendsEarned.toLocaleString()} tokens`;
            } catch {
              return `${index + 1}. **Unknown User** - ${holder.shares} shares (${holder.percentage.toFixed(1)}%)`;
            }
          })
        );
        
        embed.addFields({
          name: '👥 Shareholders',
          value: shareholderList.join('\n\n') || 'No shareholders',
          inline: false
        });
      }
      
      // Add market information
      embed.addFields(
        {
          name: '📊 Market Info',
          value: `**Share Price:** ${shareInfo.sharePrice.toLocaleString()} tokens\n` +
                 `**Available Shares:** ${shareInfo.availableShares}\n` +
                 `**Dividend Rate:** ${shareInfo.dividendPercentage}%`,
          inline: true
        },
        {
          name: '💰 Investment Stats',
          value: `**Market Cap:** ${shareStats.totalShareValue.toLocaleString()} tokens\n` +
                 `**Total Investors:** ${shareStats.shareholderCount}\n` +
                 `**Avg Dividend/Share:** ${shareStats.totalDividendsPaid > 0 
                   ? Math.floor(shareStats.totalDividendsPaid / shareStats.totalSharesSold).toLocaleString() 
                   : '0'} tokens`,
          inline: true
        }
      );
      
      // Check if user is a shareholder
      const userShareInfo = await client.shareManager.getUserShareInfo(
        interaction.user.id,
        interaction.guild!.id
      );
      
      if (userShareInfo.shares > 0) {
        embed.addFields({
          name: '📈 Your Investment',
          value: `**Shares:** ${userShareInfo.shares} (${userShareInfo.percentage.toFixed(1)}% ownership)\n` +
                 `**Value:** ${(userShareInfo.shares * shareInfo.sharePrice).toLocaleString()} tokens\n` +
                 `**Total Dividends:** ${userShareInfo.totalDividendsEarned.toLocaleString()} tokens`,
          inline: false
        });
      }
      
      embed.setFooter({ 
        text: `Use /shares info for detailed information • /shares buy to invest` 
      })
      .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error in shareholders command:', error);
      await interaction.reply({
        content: 'There was an error retrieving shareholder information.',
        ephemeral: true
      });
    }
  },
};

export default shareholders; 