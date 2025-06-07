import { SlashCommandBuilder, CommandInteraction, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { MiraClient } from '../client';
import { Command } from './commandHandler';

const shares: Command = {
  data: new SlashCommandBuilder()
    .setName('shares')
    .setDescription('Manage your server shares and view dividends')
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('View share information and your portfolio')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('buy')
        .setDescription('Buy shares in this server')
        .addIntegerOption(option =>
          option
            .setName('amount')
            .setDescription('Number of shares to buy')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sell')
        .setDescription('Sell your shares (at 80% of current price)')
        .addIntegerOption(option =>
          option
            .setName('amount')
            .setDescription('Number of shares to sell')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('roi')
        .setDescription('Calculate potential return on investment')
        .addIntegerOption(option =>
          option
            .setName('shares')
            .setDescription('Number of shares to calculate ROI for')
            .setRequired(true)
            .setMinValue(1)
        )
    ) as SlashCommandBuilder,
  
  guildOnly: true,
  cooldown: 5,

  async execute(interaction: CommandInteraction, client: MiraClient) {
    const chatInteraction = interaction as ChatInputCommandInteraction;
    const subcommand = chatInteraction.options.getSubcommand();
    
    try {
      switch (subcommand) {
        case 'info':
          await handleInfo(interaction, client);
          break;
        case 'buy':
          await handleBuy(interaction, client);
          break;
        case 'sell':
          await handleSell(interaction, client);
          break;
        case 'roi':
          await handleROI(interaction, client);
          break;
      }
    } catch (error) {
      console.error('Error in shares command:', error);
      await interaction.reply({
        content: 'There was an error processing your share request.',
        ephemeral: true
      });
    }
  },
};

async function handleInfo(interaction: CommandInteraction, client: MiraClient) {
  const shareInfo = await client.shareManager.getShareInfo(interaction.guild!.id);
  const userShareInfo = await client.shareManager.getUserShareInfo(
    interaction.user.id,
    interaction.guild!.id
  );
  
  const embed = new EmbedBuilder()
    .setTitle('📈 Server Share Information')
    .setColor(shareInfo.enabled ? 0x00ff00 : 0xff0000)
    .setThumbnail(interaction.guild!.iconURL() || '');
  
  if (!shareInfo.enabled) {
    embed.setDescription('❌ Share system is not enabled on this server');
  } else {
    embed.setDescription(
      `Invest in this server and earn passive income from all token spending!\n\n` +
      `**Share Details:**`
    )
    .addFields(
      { 
        name: '💰 Share Price', 
        value: `${shareInfo.sharePrice.toLocaleString()} tokens per share`, 
        inline: true 
      },
      { 
        name: '📊 Available Shares', 
        value: `${shareInfo.availableShares}/${shareInfo.totalShares}`, 
        inline: true 
      },
      { 
        name: '💸 Dividend Rate', 
        value: `${shareInfo.dividendPercentage}% of all spending`, 
        inline: true 
      },
      { 
        name: '📈 Your Portfolio', 
        value: userShareInfo.shares > 0 
          ? `**${userShareInfo.shares} shares** (${userShareInfo.percentage.toFixed(1)}% ownership)`
          : 'No shares owned', 
        inline: true 
      },
      { 
        name: '💵 Total Dividends Earned', 
        value: `${userShareInfo.totalDividendsEarned.toLocaleString()} tokens`, 
        inline: true 
      },
      { 
        name: '📅 Est. Daily Dividend', 
        value: userShareInfo.estimatedDailyDividend > 0
          ? `~${userShareInfo.estimatedDailyDividend.toLocaleString()} tokens/day`
          : 'N/A', 
        inline: true 
      }
    );
    
    if (shareInfo.availableShares > 0) {
      embed.addFields({
        name: '💡 Investment Tip',
        value: `Buy shares to earn ${shareInfo.dividendPercentage}% of all tokens spent on this server!\n` +
               `Maximum ${shareInfo.maxSharesPerUser} shares per user.`,
        inline: false
      });
    }
  }
  
  embed.setFooter({ 
    text: `Use /shares buy to invest • Shares sell at 80% of purchase price` 
  })
  .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleBuy(interaction: CommandInteraction, client: MiraClient) {
  const chatInteraction = interaction as ChatInputCommandInteraction;
  const amount = chatInteraction.options.getInteger('amount', true);
  
  const canBuy = await client.shareManager.canBuyShares(
    interaction.user.id,
    interaction.guild!.id,
    amount
  );
  
  if (!canBuy.canBuy) {
    await interaction.reply({
      content: `❌ Cannot buy shares: ${canBuy.reason}`,
      ephemeral: true
    });
    return;
  }
  
  const shareInfo = await client.shareManager.getShareInfo(interaction.guild!.id);
  const totalCost = amount * shareInfo.sharePrice;
  
  // Confirm purchase
  const embed = new EmbedBuilder()
    .setTitle('📈 Confirm Share Purchase')
    .setColor(0x0099ff)
    .setDescription(
      `You are about to buy **${amount} shares** in **${interaction.guild!.name}**\n\n` +
      `**Total Cost:** ${totalCost.toLocaleString()} tokens\n` +
      `**Price per Share:** ${shareInfo.sharePrice.toLocaleString()} tokens\n` +
      `**Ownership:** ${((amount / shareInfo.totalShares) * 100).toFixed(1)}%\n\n` +
      `⚠️ **Note:** Shares can only be sold at 80% of the current price!`
    )
    .setFooter({ text: 'React with ✅ to confirm or ❌ to cancel' });
  
  const message = await interaction.reply({ 
    embeds: [embed], 
    ephemeral: true,
    fetchReply: true 
  });
  
  try {
    await message.react('✅');
    await message.react('❌');
    
    const filter = (reaction: any, user: any) => {
      return ['✅', '❌'].includes(reaction.emoji.name) && user.id === interaction.user.id;
    };
    
    const collected = await message.awaitReactions({ filter, max: 1, time: 30000 });
    const reaction = collected.first();
    
    if (!reaction || reaction.emoji.name === '❌') {
      await interaction.editReply({
        content: '❌ Share purchase cancelled.',
        embeds: []
      });
      return;
    }
    
    // Process purchase
    const success = await client.shareManager.buyShares(
      interaction.user.id,
      interaction.guild!.id,
      amount
    );
    
    if (success) {
      const roi = await client.shareManager.estimateROI(interaction.guild!.id, amount);
      
      await interaction.editReply({
        content: `✅ Successfully purchased **${amount} shares** for **${totalCost.toLocaleString()} tokens**!\n\n` +
                 `📊 **Estimated Returns:**\n` +
                 `• Daily: ~${roi.dailyEstimate} tokens\n` +
                 `• Weekly: ~${roi.weeklyEstimate} tokens\n` +
                 `• Monthly: ~${roi.monthlyEstimate} tokens\n` +
                 `• Break-even: ~${roi.breakEvenDays} days`,
        embeds: []
      });
    } else {
      await interaction.editReply({
        content: '❌ Failed to purchase shares. Please try again.',
        embeds: []
      });
    }
  } catch (error) {
    await interaction.editReply({
      content: '❌ Purchase timed out.',
      embeds: []
    });
  }
}

async function handleSell(interaction: CommandInteraction, client: MiraClient) {
  const chatInteraction = interaction as ChatInputCommandInteraction;
  const amount = chatInteraction.options.getInteger('amount', true);
  
  const userShares = await client.shareManager.getUserShareInfo(
    interaction.user.id,
    interaction.guild!.id
  );
  
  if (userShares.shares < amount) {
    await interaction.reply({
      content: `❌ You only have ${userShares.shares} shares to sell.`,
      ephemeral: true
    });
    return;
  }
  
  const shareInfo = await client.shareManager.getShareInfo(interaction.guild!.id);
  const sellPrice = Math.floor(shareInfo.sharePrice * 0.8);
  const totalValue = amount * sellPrice;
  
  const embed = new EmbedBuilder()
    .setTitle('💰 Confirm Share Sale')
    .setColor(0xff9900)
    .setDescription(
      `You are about to sell **${amount} shares** in **${interaction.guild!.name}**\n\n` +
      `**Sell Price:** ${sellPrice.toLocaleString()} tokens per share (80% of market price)\n` +
      `**Total Value:** ${totalValue.toLocaleString()} tokens\n` +
      `**Remaining Shares:** ${userShares.shares - amount}\n\n` +
      `⚠️ **Warning:** You're selling at a 20% loss from the current market price!`
    )
    .setFooter({ text: 'React with ✅ to confirm or ❌ to cancel' });
  
  const message = await interaction.reply({ 
    embeds: [embed], 
    ephemeral: true,
    fetchReply: true 
  });
  
  try {
    await message.react('✅');
    await message.react('❌');
    
    const filter = (reaction: any, user: any) => {
      return ['✅', '❌'].includes(reaction.emoji.name) && user.id === interaction.user.id;
    };
    
    const collected = await message.awaitReactions({ filter, max: 1, time: 30000 });
    const reaction = collected.first();
    
    if (!reaction || reaction.emoji.name === '❌') {
      await interaction.editReply({
        content: '❌ Share sale cancelled.',
        embeds: []
      });
      return;
    }
    
    const success = await client.shareManager.sellShares(
      interaction.user.id,
      interaction.guild!.id,
      amount
    );
    
    if (success) {
      await interaction.editReply({
        content: `✅ Successfully sold **${amount} shares** for **${totalValue.toLocaleString()} tokens**!`,
        embeds: []
      });
    } else {
      await interaction.editReply({
        content: '❌ Failed to sell shares. Please try again.',
        embeds: []
      });
    }
  } catch (error) {
    await interaction.editReply({
      content: '❌ Sale timed out.',
      embeds: []
    });
  }
}

async function handleROI(interaction: CommandInteraction, client: MiraClient) {
  const chatInteraction = interaction as ChatInputCommandInteraction;
  const shares = chatInteraction.options.getInteger('shares', true);
  
  const shareInfo = await client.shareManager.getShareInfo(interaction.guild!.id);
  
  if (!shareInfo.enabled) {
    await interaction.reply({
      content: '❌ Share system is not enabled on this server.',
      ephemeral: true
    });
    return;
  }
  
  if (shares > shareInfo.availableShares) {
    await interaction.reply({
      content: `❌ Only ${shareInfo.availableShares} shares are available for purchase.`,
      ephemeral: true
    });
    return;
  }
  
  const roi = await client.shareManager.estimateROI(interaction.guild!.id, shares);
  const investmentCost = shares * shareInfo.sharePrice;
  
  const embed = new EmbedBuilder()
    .setTitle('📊 Return on Investment Calculator')
    .setColor(0x00ff00)
    .setDescription(
      `**Investment Analysis for ${shares} shares:**\n\n` +
      `💰 **Initial Investment:** ${investmentCost.toLocaleString()} tokens\n` +
      `📈 **Ownership Percentage:** ${((shares / shareInfo.totalShares) * 100).toFixed(2)}%\n`
    )
    .addFields(
      { 
        name: '📅 Daily Returns', 
        value: `~${roi.dailyEstimate.toLocaleString()} tokens`, 
        inline: true 
      },
      { 
        name: '📆 Weekly Returns', 
        value: `~${roi.weeklyEstimate.toLocaleString()} tokens`, 
        inline: true 
      },
      { 
        name: '🗓️ Monthly Returns', 
        value: `~${roi.monthlyEstimate.toLocaleString()} tokens`, 
        inline: true 
      },
      { 
        name: '⏱️ Break-Even Time', 
        value: roi.breakEvenDays > 0 ? `~${roi.breakEvenDays} days` : 'N/A', 
        inline: true 
      },
      { 
        name: '📊 Annual ROI', 
        value: roi.dailyEstimate > 0 
          ? `~${((roi.dailyEstimate * 365 / investmentCost) * 100).toFixed(1)}%` 
          : 'N/A', 
        inline: true 
      },
      { 
        name: '💡 Note', 
        value: 'Returns are estimated based on recent server activity and may vary.', 
        inline: false 
      }
    )
    .setFooter({ text: 'Use /shares buy to invest' })
    .setTimestamp();
  
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export default shares; 