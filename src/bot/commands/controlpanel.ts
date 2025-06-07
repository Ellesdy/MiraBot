import { 
  SlashCommandBuilder, 
  CommandInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder,
  ComponentType,
  StringSelectMenuInteraction,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction
} from 'discord.js';
import { MiraClient } from '../client';
import { Command } from './commandHandler';
import { DEFAULT_ACTIONS } from '../../database/models';
import { logger } from '../../utils/logger';

// Helper functions for control panel actions
export async function showBalance(interaction: StringSelectMenuInteraction, client: MiraClient) {
  const userTokens = await client.tokenManager.getUserTokens(interaction.user.id);
  const shareInfo = await client.shareManager.getUserShareInfo(interaction.user.id, interaction.guild!.id);
  
  const embed = new EmbedBuilder()
    .setTitle('💰 Your Balance Report')
    .setDescription('Here is your current financial status, citizen.')
    .setColor(0x00ff00)
    .addFields(
      { name: 'Token Balance', value: `${userTokens.toLocaleString()} tokens`, inline: true },
      { name: 'Share Holdings', value: `${shareInfo.shares.toLocaleString()} shares`, inline: true },
      { name: 'Ownership', value: `${shareInfo.percentage.toFixed(2)}%`, inline: true },
      { name: 'Total Dividends Earned', value: `${shareInfo.totalDividendsEarned.toLocaleString()} tokens`, inline: false }
    )
          .setFooter({ text: 'Robotic Policeman • Financial Division' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export async function showActions(interaction: StringSelectMenuInteraction, client: MiraClient) {
  const server = await client.getGuildSettings(interaction.guild!.id);
  const userTokens = await client.tokenManager.getUserTokens(interaction.user.id);
  
  // Import the adaptive economy service at the top of the function
  const { adaptiveEconomyService } = await import('../../services/adaptiveEconomyService');
  
  // Get market trends for all actions
  const trends = await adaptiveEconomyService.getMarketTrends(interaction.guild!.id);
  
  const embed = new EmbedBuilder()
    .setTitle('🛒 Available Actions')
    .setDescription(`Your balance: **${userTokens.toLocaleString()}** tokens\nUse \`/controlpanel\` and select "Perform Action" to use actions.\n\n*Prices adjust based on demand!*`)
    .setColor(0x0099ff)
    .setFooter({ text: 'Robotic Policeman • Action Registry' })
    .setTimestamp();

  // Group actions by category
  const categories: { [key: string]: { name: string; actions: string[] } } = {
    'moderation': { name: '🔨 Moderation', actions: [] },
    'fun': { name: '🎉 Fun', actions: [] },
    'utility': { name: '🔧 Utility', actions: [] }
  };

  for (const action of DEFAULT_ACTIONS) {
    if (server?.settings.enabledActions.includes(action.id)) {
      const cost = server.settings.actionPrices[action.id] || action.defaultPrice;
      const canAfford = userTokens >= cost;
      const emoji = canAfford ? '✅' : '❌';
      
      // Get trend data for this action
      const trend = trends[action.id];
      let trendIndicator = '';
      
      if (trend && trend.priceChange24h !== 0) {
        if (trend.priceChange24h > 0) {
          trendIndicator = ` 📈 +${trend.priceChange24h.toFixed(1)}%`;
        } else {
          trendIndicator = ` 📉 ${trend.priceChange24h.toFixed(1)}%`;
        }
      }
      
      categories[action.category].actions.push(
        `${emoji} **${action.name}** - ${cost} tokens${trendIndicator}\n└ ${action.description}`
      );
    }
  }

  for (const category of Object.values(categories)) {
    if (category.actions.length > 0) {
      embed.addFields({
        name: category.name,
        value: category.actions.join('\n'),
        inline: false
      });
    }
  }

  await interaction.editReply({ embeds: [embed] });
}

export async function showShares(interaction: StringSelectMenuInteraction, client: MiraClient) {
  try {
    const shareInfo = await client.shareManager.getShareInfo(interaction.guild!.id);
    
    if (!shareInfo) {
      await interaction.editReply({ 
        content: '❌ Share market information is not available for this server.', 
        embeds: [] 
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('📈 Share Market Information')
      .setDescription('Current market conditions and share statistics.')
      .setColor(0xffd700)
      .addFields(
        { name: 'Share Price', value: `${(shareInfo.sharePrice || 0).toLocaleString()} tokens`, inline: true },
        { name: 'Total Shares', value: (shareInfo.totalShares || 0).toLocaleString(), inline: true },
        { name: 'Available', value: (shareInfo.availableShares || 0).toLocaleString(), inline: true },
        { name: 'Market Cap', value: `${((shareInfo.totalShares || 0) * (shareInfo.sharePrice || 0)).toLocaleString()} tokens`, inline: false },
        { name: 'Dividend Rate', value: `${shareInfo.dividendPercentage || 0}% of all spending`, inline: true }
      )
      .setFooter({ text: 'Robotic Policeman • Securities Division' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in showShares:', error);
    await interaction.editReply({ 
      content: '❌ An error occurred while fetching share market information.', 
      embeds: [] 
    });
  }
}

export async function showShareholders(interaction: StringSelectMenuInteraction, client: MiraClient) {
  const topShareholders = await client.shareManager.getTopShareholders(interaction.guild!.id, 10);
  
  const embed = new EmbedBuilder()
    .setTitle('🏆 Top Shareholders')
    .setDescription('The wealthiest citizens in our community.')
    .setColor(0xffd700)
    .setFooter({ text: 'Robotic Policeman • Registry Division' })
    .setTimestamp();

  const shareholderList = topShareholders.map((holder, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    return `${medal} <@${holder.userId}> - ${holder.shares.toLocaleString()} shares (${holder.percentage.toFixed(1)}%)`;
  }).join('\n');

  embed.addFields({
    name: 'Leaderboard',
    value: shareholderList || 'No shareholders yet.',
    inline: false
  });

  await interaction.editReply({ embeds: [embed] });
}

export async function showVoiceStats(interaction: StringSelectMenuInteraction, client: MiraClient) {
  const stats = await client.voiceActivityManager.getUserVoiceStats(interaction.user.id, interaction.guild!.id);
  
  const embed = new EmbedBuilder()
    .setTitle('🎙️ Voice Activity Stats')
    .setDescription('Your voice channel participation record.')
    .setColor(0x9b59b6)
    .addFields(
      { name: 'Currently Active', value: stats.isActive ? 'Yes ✅' : 'No ❌', inline: true },
      { name: 'Current Session', value: `${stats.currentSessionMinutes} minutes`, inline: true },
      { name: 'Today Total', value: `${stats.todayMinutes} minutes`, inline: true }
    )
    .setFooter({ text: 'Robotic Policeman • Communications Division' })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export async function showActionSelector(interaction: StringSelectMenuInteraction, client: MiraClient) {
  const server = await client.getGuildSettings(interaction.guild!.id);
  const userTokens = await client.tokenManager.getUserTokens(interaction.user.id);
  
  if (!server) {
    await interaction.update({ 
      content: '❌ Server configuration not found.', 
      embeds: [], 
      components: [] 
    });
    return;
  }

  // Get available actions
  const availableActions: { label: string; description: string; value: string; emoji?: string }[] = [];
  
  for (const action of DEFAULT_ACTIONS) {
    if (server.settings.enabledActions.includes(action.id)) {
      const cost = server.settings.actionPrices[action.id] || action.defaultPrice;
      const canAfford = userTokens >= cost;
      
      availableActions.push({
        label: action.name,
        description: `${cost} tokens - ${canAfford ? 'Available' : 'Insufficient tokens'}`,
        value: action.id,
        emoji: canAfford ? '✅' : '❌'
      });
    }
  }

  if (availableActions.length === 0) {
    await interaction.update({ 
      content: '❌ No actions are available on this server.', 
      embeds: [], 
      components: [] 
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('⚡ Step 1: Select an Action')
    .setDescription(`Your balance: **${userTokens.toLocaleString()} tokens**\n\n**Select an action to perform from the dropdown below.**\nAfter selecting, you'll choose a target user.`)
    .setColor(0xffcc00)
    .setFooter({ text: 'Robotic Policeman • Action Control' })
    .setTimestamp();

  const actionMenu = new StringSelectMenuBuilder()
    .setCustomId('action_selector')
    .setPlaceholder('Choose an action...')
    .addOptions(availableActions);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(actionMenu);

  // Update with new menu
  await interaction.update({ 
    embeds: [embed], 
    components: [row] 
  });

  // Create collector for action selection
  const actionCollector = interaction.message.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.customId === 'action_selector' && i.user.id === interaction.user.id,
    time: 60000 // 1 minute
  });

  actionCollector.on('collect', async (actionInteraction: StringSelectMenuInteraction) => {
    try {
      // Don't defer here - we need to show a modal directly
      const selectedAction = actionInteraction.values[0];
      
      logger.debug(`User selected action: ${selectedAction}`);
      
      // Show user selector modal directly without deferring
      await showUserSelector(actionInteraction, client, selectedAction);
      
      // Stop this collector
      actionCollector.stop('action_selected');
    } catch (error: any) {
      logger.error('Error in action collector:', error);
      
      // Handle "Unknown interaction" error
      if (error.code === 10062) {
        logger.debug('Action interaction expired or already handled');
        return;
      }
      
      // Try to send error message
      try {
        if (!actionInteraction.replied && !actionInteraction.deferred) {
          await actionInteraction.reply({
            content: '⚠️ An error occurred. Please try again.',
            ephemeral: true
          });
        } else {
          await actionInteraction.followUp({
            content: '⚠️ An error occurred. Please try again.',
            ephemeral: true
          });
        }
      } catch (msgError) {
        logger.error('Could not send error message:', msgError);
      }
    }
  });

  actionCollector.on('end', (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      interaction.editReply({ 
        content: '⏰ Action selection timed out.', 
        embeds: [], 
        components: [] 
      }).catch(() => {});
    }
  });
}

async function showUserSelector(interaction: StringSelectMenuInteraction, client: MiraClient, actionId: string) {
  const action = DEFAULT_ACTIONS.find(a => a.id === actionId);
  if (!action) {
    await interaction.update({ 
      content: '❌ Invalid action selected.', 
      embeds: [], 
      components: [] 
    });
    return;
  }

  const server = await client.getGuildSettings(interaction.guild!.id);
  const cost = server?.settings.actionPrices[actionId] || action.defaultPrice;

  // Create modal for user search
  const modal = new ModalBuilder()
    .setCustomId(`user_search_${actionId}`)
    .setTitle('Search for Target User');

  const searchInput = new TextInputBuilder()
    .setCustomId('user_search_input')
    .setLabel('Enter username or nickname')
    .setPlaceholder('e.g., JohnDoe or John')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(100);

  const actionRow = new ActionRowBuilder<TextInputBuilder>()
    .addComponents(searchInput);

  modal.addComponents(actionRow);

  // Show the modal
  try {
    await interaction.showModal(modal);
  } catch (error: any) {
    logger.error('Error showing user search modal:', error);
    
    // If we can't show a modal, fall back to updating with an error
    if (error.code === 'InteractionAlreadyReplied') {
      await interaction.followUp({
        content: '❌ Unable to show the search dialog. Please try again.',
        ephemeral: true
      });
    } else {
      await interaction.update({
        content: '❌ An error occurred while opening the search dialog.',
        embeds: [],
        components: []
      });
    }
    return;
  }

  // Wait for modal submission
  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 60000, // 1 minute timeout
      filter: (i) => i.customId === `user_search_${actionId}` && i.user.id === interaction.user.id
    });

    await modalSubmission.deferUpdate();

    const searchQuery = modalSubmission.fields.getTextInputValue('user_search_input').toLowerCase();

    // Search for matching members
    const members = await interaction.guild!.members.fetch();
    const matchingMembers = members.filter(member => {
      // Skip bots, self, and server owner
      if (member.user.bot || 
          member.id === interaction.user.id || 
          member.id === interaction.guild!.ownerId) {
        return false;
      }

      const username = member.user.username.toLowerCase();
      const displayName = member.displayName.toLowerCase();
      const tag = member.user.tag.toLowerCase();

      return username.includes(searchQuery) || 
             displayName.includes(searchQuery) || 
             tag.includes(searchQuery);
    });

    if (matchingMembers.size === 0) {
      await modalSubmission.editReply({ 
        content: `❌ No users found matching "${modalSubmission.fields.getTextInputValue('user_search_input')}". Please try again.`, 
        embeds: [], 
        components: [] 
      });
      return;
    }

    // If single match, confirm and execute
    if (matchingMembers.size === 1) {
      const target = matchingMembers.first()!;
      // For modal submissions, we can directly execute since the modal itself is a form of confirmation
      await executeAction(modalSubmission, client, actionId, target.id);
    } 
    // If multiple matches (up to 25), show selection menu
    else {
      const memberOptions = Array.from(matchingMembers.values())
        .slice(0, 25) // Discord limit
        .map(member => ({
          label: member.displayName,
          description: `@${member.user.username}`,
          value: member.id
        }));

      const selectEmbed = new EmbedBuilder()
        .setTitle(`⚡ Multiple Matches Found`)
        .setDescription(`Found **${matchingMembers.size}** users matching "${modalSubmission.fields.getTextInputValue('user_search_input')}".\n\nSelect the correct target from the dropdown below.`)
        .setColor(0xffcc00)
        .setFooter({ text: 'Robotic Policeman • Clarify Target' })
        .setTimestamp();

      const userMenu = new StringSelectMenuBuilder()
        .setCustomId('clarify_user_selector')
        .setPlaceholder('Select the correct user...')
        .addOptions(memberOptions);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(userMenu);

      await modalSubmission.editReply({ 
        embeds: [selectEmbed], 
        components: [row] 
      });

      // Create collector for clarification
      const clarifyCollector = modalSubmission.message!.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: (i) => i.customId === 'clarify_user_selector' && i.user.id === interaction.user.id,
        time: 30000
      });

      clarifyCollector.on('collect', async (clarifyInteraction: StringSelectMenuInteraction) => {
        try {
          // Check if interaction has already been deferred or replied to
          if (!clarifyInteraction.deferred && !clarifyInteraction.replied) {
            await clarifyInteraction.deferUpdate();
          }
          
          const targetUserId = clarifyInteraction.values[0];
          
          await executeAction(clarifyInteraction, client, actionId, targetUserId);
          clarifyCollector.stop('user_selected');
        } catch (error: any) {
          logger.error('Error in clarify collector:', error);
          
          if (error.code === 10062) {
            logger.debug('Clarify interaction expired or already handled');
            return;
          }
        }
      });

      clarifyCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          modalSubmission.editReply({ 
            content: '⏰ Target selection timed out.', 
            embeds: [], 
            components: [] 
          }).catch(() => {});
        }
      });
    }
  } catch (error: any) {
    if (error.code === 'InteractionCollectorError') {
      // Modal timed out
      logger.debug('User search modal timed out');
    } else {
      logger.error('Error handling user search modal:', error);
    }
  }
}

async function confirmAndExecute(
  interaction: StringSelectMenuInteraction | ButtonInteraction | ModalSubmitInteraction, 
  client: MiraClient, 
  actionId: string, 
  targetUserId: string,
  actionName: string,
  cost: number
) {
  const targetUser = await client.users.fetch(targetUserId);
  
  const confirmEmbed = new EmbedBuilder()
    .setTitle('⚡ Confirm Action')
    .setDescription(`**Action:** ${actionName}\n**Target:** ${targetUser.username}\n**Cost:** ${cost} tokens\n\nIs this correct?`)
    .setColor(0xffcc00)
    .setThumbnail(targetUser.displayAvatarURL())
    .setFooter({ text: 'Robotic Policeman • Confirmation' })
    .setTimestamp();

  // Create confirm/cancel buttons
  const confirmButton = new ButtonBuilder()
    .setCustomId('confirm_action')
    .setLabel('Confirm')
    .setStyle(ButtonStyle.Success)
    .setEmoji('✅');

  const cancelButton = new ButtonBuilder()
    .setCustomId('cancel_action')
    .setLabel('Cancel')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('❌');

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(confirmButton, cancelButton);

  await interaction.editReply({ 
    embeds: [confirmEmbed], 
    components: [row]
  });

  // Create collector for confirmation
  if (!interaction.message) {
    logger.error('No message available for confirmation collector');
    return;
  }
  
  const confirmCollector = interaction.message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === interaction.user.id,
    time: 30000
  });

  confirmCollector.on('collect', async (buttonInteraction: ButtonInteraction) => {
    try {
      // Check if interaction has already been deferred or replied to
      if (!buttonInteraction.deferred && !buttonInteraction.replied) {
        await buttonInteraction.deferUpdate();
      }
      
      if (buttonInteraction.customId === 'confirm_action') {
        await executeAction(buttonInteraction, client, actionId, targetUserId);
      } else {
        await buttonInteraction.editReply({ 
          content: '❌ Action cancelled.', 
          embeds: [], 
          components: [] 
        });
      }
      
      confirmCollector.stop('button_pressed');
    } catch (error: any) {
      logger.error('Error in confirm collector:', error);
      
      if (error.code === 10062) {
        logger.debug('Confirm interaction expired or already handled');
        return;
      }
    }
  });

  confirmCollector.on('end', (collected, reason) => {
    if (reason === 'time' && collected.size === 0) {
      interaction.editReply({ 
        content: '⏰ Confirmation timed out. Action cancelled.', 
        embeds: [], 
        components: [] 
      }).catch(() => {});
    }
  });
}

async function executeAction(interaction: StringSelectMenuInteraction | ButtonInteraction | ModalSubmitInteraction, client: MiraClient, actionId: string, targetUserId: string) {
  try {
    // Special handling for actions that need additional input
    // These can only be shown from button/select menu interactions, not from modal submissions
    if (actionId === 'nickname_change' || actionId === 'send_dm') {
      if (!interaction.isModalSubmit()) {
        if (actionId === 'nickname_change') {
          await showNicknameInput(interaction, client, targetUserId);
        } else {
          await showMessageInput(interaction, client, targetUserId);
        }
        return;
      }
      // If it's a modal submission, we can't show another modal, so fall through to regular execution
    }

    // Execute the action
    const result = await client.actionManager.performAction(
      interaction.user.id,
      targetUserId,
      actionId,
      interaction.guild!.id
    );

    const targetUser = await client.users.fetch(targetUserId);
    const embed = new EmbedBuilder()
      .setTitle(result.success ? '✅ Action Successful' : '❌ Action Failed')
      .setDescription(result.message)
      .setColor(result.success ? 0x00ff00 : 0xff0000)
      .addFields(
        { name: 'Action', value: DEFAULT_ACTIONS.find(a => a.id === actionId)?.name || actionId, inline: true },
        { name: 'Target', value: targetUser.username, inline: true },
        { name: 'Cost', value: result.cost ? `${result.cost} tokens` : 'N/A', inline: true }
      )
      .setFooter({ text: 'Robotic Policeman • Action Executed' })
      .setTimestamp();

    await interaction.editReply({ 
      embeds: [embed], 
      components: [] 
    });

    // Generate AI response for the action
    if (result.success) {
      const { aiService } = await import('../../services/aiService');
      const aiResponse = await aiService.generateActionResponse(
        actionId,
        targetUser.username,
        interaction.user.username
      );
      
      // Send a follow-up message with the AI response
      await interaction.followUp({
        content: aiResponse,
        ephemeral: true
      });
    }
  } catch (error) {
    logger.error('Error executing action:', error);
    await interaction.editReply({ 
      content: '❌ An error occurred while executing the action.', 
      embeds: [], 
      components: [] 
    });
  }
}

async function showNicknameInput(interaction: StringSelectMenuInteraction | ButtonInteraction | ModalSubmitInteraction, client: MiraClient, targetUserId: string) {
  // If this is already a modal submission, we need to handle it differently
  if (interaction.isModalSubmit()) {
    const embed = new EmbedBuilder()
      .setTitle('✏️ Nickname Change')
      .setDescription('Processing nickname change...')
      .setColor(0xffcc00)
      .setFooter({ text: 'Robotic Policeman • Processing' })
      .setTimestamp();

    await interaction.editReply({ 
      embeds: [embed], 
      components: [] 
    });
    
    // Show error - can't show another modal from a modal
    await interaction.editReply({
      content: '❌ Cannot show nickname input from this context. This action requires direct selection.',
      embeds: [],
      components: []
    });
    return;
  }

  // Create modal for nickname input
  const modal = new ModalBuilder()
    .setCustomId(`nickname_input_${targetUserId}`)
    .setTitle('Change Nickname');

  const nicknameInput = new TextInputBuilder()
    .setCustomId('nickname_input')
    .setLabel('New Nickname')
    .setPlaceholder('Enter the new nickname (max 32 chars)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(32);

  const actionRow = new ActionRowBuilder<TextInputBuilder>()
    .addComponents(nicknameInput);

  modal.addComponents(actionRow);

  // Show the modal
  try {
    await interaction.showModal(modal);
  } catch (error: any) {
    logger.error('Error showing nickname modal:', error);
    await interaction.editReply({
      content: '❌ Unable to show the nickname input dialog.',
      embeds: [],
      components: []
    });
    return;
  }

  // Wait for modal submission
  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 60000,
      filter: (i) => i.customId === `nickname_input_${targetUserId}` && i.user.id === interaction.user.id
    });

    await modalSubmission.deferUpdate();

    const nickname = modalSubmission.fields.getTextInputValue('nickname_input').slice(0, 32);

    // Execute the action with the nickname
    const result = await client.actionManager.performAction(
      interaction.user.id,
      targetUserId,
      'nickname_change',
      interaction.guild!.id,
      { nickname }
    );

    const targetUser = await client.users.fetch(targetUserId);
    const embed = new EmbedBuilder()
      .setTitle(result.success ? '✅ Nickname Changed' : '❌ Action Failed')
      .setDescription(result.message)
      .setColor(result.success ? 0x00ff00 : 0xff0000)
      .addFields(
        { name: 'Target', value: targetUser.username, inline: true },
        { name: 'New Nickname', value: nickname, inline: true },
        { name: 'Cost', value: result.cost ? `${result.cost} tokens` : 'N/A', inline: true }
      )
      .setFooter({ text: 'Robotic Policeman • Action Executed' })
      .setTimestamp();

    await modalSubmission.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error.code === 'InteractionCollectorError') {
      logger.debug('Nickname input modal timed out');
    } else {
      logger.error('Error handling nickname modal:', error);
    }
  }
}

async function showMessageInput(interaction: StringSelectMenuInteraction | ButtonInteraction | ModalSubmitInteraction, client: MiraClient, targetUserId: string) {
  // If this is already a modal submission, we need to handle it differently
  if (interaction.isModalSubmit()) {
    const embed = new EmbedBuilder()
      .setTitle('📨 Send DM')
      .setDescription('Processing message...')
      .setColor(0xffcc00)
      .setFooter({ text: 'Robotic Policeman • Processing' })
      .setTimestamp();

    await interaction.editReply({ 
      embeds: [embed], 
      components: [] 
    });
    
    // Show error - can't show another modal from a modal
    await interaction.editReply({
      content: '❌ Cannot show message input from this context. This action requires direct selection.',
      embeds: [],
      components: []
    });
    return;
  }

  // Create modal for message input
  const modal = new ModalBuilder()
    .setCustomId(`dm_input_${targetUserId}`)
    .setTitle('Send Direct Message');

  const messageInput = new TextInputBuilder()
    .setCustomId('message_input')
    .setLabel('Your Message')
    .setPlaceholder('Enter your message (max 500 chars)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(500);

  const actionRow = new ActionRowBuilder<TextInputBuilder>()
    .addComponents(messageInput);

  modal.addComponents(actionRow);

  // Show the modal
  try {
    await interaction.showModal(modal);
  } catch (error: any) {
    logger.error('Error showing message modal:', error);
    await interaction.editReply({
      content: '❌ Unable to show the message input dialog.',
      embeds: [],
      components: []
    });
    return;
  }

  // Wait for modal submission
  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      time: 60000,
      filter: (i) => i.customId === `dm_input_${targetUserId}` && i.user.id === interaction.user.id
    });

    await modalSubmission.deferUpdate();

    const dmMessage = modalSubmission.fields.getTextInputValue('message_input').slice(0, 500);

    // Execute the action with the message
    const result = await client.actionManager.performAction(
      interaction.user.id,
      targetUserId,
      'send_dm',
      interaction.guild!.id,
      { message: dmMessage }
    );

    const targetUser = await client.users.fetch(targetUserId);
    const embed = new EmbedBuilder()
      .setTitle(result.success ? '✅ DM Sent' : '❌ Action Failed')
      .setDescription(result.message)
      .setColor(result.success ? 0x00ff00 : 0xff0000)
      .addFields(
        { name: 'Target', value: targetUser.username, inline: true },
        { name: 'Cost', value: result.cost ? `${result.cost} tokens` : 'N/A', inline: true }
      )
      .setFooter({ text: 'Robotic Policeman • Action Executed' })
      .setTimestamp();

    await modalSubmission.editReply({ embeds: [embed] });
  } catch (error: any) {
    if (error.code === 'InteractionCollectorError') {
      logger.debug('Message input modal timed out');
    } else {
      logger.error('Error handling message modal:', error);
    }
  }
}

const controlpanel: Command = {
  data: new SlashCommandBuilder()
    .setName('controlpanel')
    .setDescription('Open the payment terminal - I mean, control panel'),
  
  guildOnly: true,
  cooldown: 5,

  async execute(interaction: CommandInteraction, client: MiraClient) {
    // Defer the reply immediately to prevent timeout
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (deferError: any) {
      // If we can't even defer, the interaction has expired
      if (deferError.code === 10062) {
        logger.debug('Control panel interaction expired before deferral');
      } else {
        logger.error('Error deferring control panel interaction:', deferError);
      }
      return; // Exit early if we can't defer
    }
    
    try {
      const server = await client.getGuildSettings(interaction.guild!.id);
      const userTokens = await client.tokenManager.getUserTokens(interaction.user.id);
      
      let shareInfo;
      try {
        shareInfo = await client.shareManager.getUserShareInfo(interaction.user.id, interaction.guild!.id);
      } catch (error) {
        logger.debug('Could not fetch share info:', error);
        shareInfo = { shares: 0, percentage: 0, totalDividendsEarned: 0, estimatedDailyDividend: 0 };
      }
      
      if (!server) {
        await interaction.editReply({
          content: '❌ Server configuration not found. Please contact an administrator.'
        });
        return;
      }

      // Create the main control panel embed
      const embed = new EmbedBuilder()
        .setTitle('🤖 MIRA Control Panel')
        .setDescription('Welcome, citizen! I am the Robotic Policeman. Everything has a price. Select an action from the dropdown menu below.')
        .setColor(0x0099ff)
        .addFields(
          { name: '💰 Token Balance', value: `${userTokens.toLocaleString()} tokens`, inline: true },
          { name: '📈 Share Holdings', value: `${shareInfo.shares.toLocaleString()} shares`, inline: true },
          { name: '🏛️ Server', value: interaction.guild!.name, inline: true }
        )
        .setThumbnail(client.user?.displayAvatarURL() || '')
        .setFooter({ text: 'Robotic Policeman • Pay to Play' })
        .setTimestamp();

      // Create dropdown menu options
      const options = [
        {
          label: '💰 Check Balance',
          description: 'View your detailed token balance and earnings',
          value: 'balance',
          emoji: '💰'
        },
        {
          label: '🛒 View Actions',
          description: 'See all available token actions and prices',
          value: 'actions',
          emoji: '🛒'
        },
        {
          label: '📈 Share Market',
          description: 'View share prices and market information',
          value: 'shares',
          emoji: '📈'
        },
        {
          label: '🏆 Shareholders',
          description: 'See the top shareholders leaderboard',
          value: 'shareholders',
          emoji: '🏆'
        },
        {
          label: '🎙️ Voice Activity',
          description: 'Check your voice channel activity stats',
          value: 'voice',
          emoji: '🎙️'
        },
        {
          label: '⚡ Perform Action',
          description: 'Use your tokens to perform actions on other users',
          value: 'perform_action',
          emoji: '⚡'
        }
      ];

      // Create the select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('control_panel_menu')
        .setPlaceholder('Select an action...')
        .addOptions(options);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(selectMenu);

      // Send the control panel
      const response = await interaction.editReply({ 
        embeds: [embed], 
        components: [row]
      });

      // Create a collector for the select menu
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 300000 // 5 minutes
      });

      collector.on('collect', async (menuInteraction: StringSelectMenuInteraction) => {
        if (menuInteraction.user.id !== interaction.user.id) {
          await menuInteraction.reply({ 
            content: 'This control panel is not for you, citizen!', 
            ephemeral: true 
          });
          return;
        }

        try {
          const selectedValue = menuInteraction.values[0];
          
          // Only defer if we're not going to show a modal later
          if (selectedValue !== 'perform_action') {
            if (!menuInteraction.deferred && !menuInteraction.replied) {
              await menuInteraction.deferUpdate();
            }
          }

          switch (selectedValue) {
            case 'balance':
              await showBalance(menuInteraction, client);
              break;
            case 'actions':
              await showActions(menuInteraction, client);
              break;
            case 'shares':
              await showShares(menuInteraction, client);
              break;
            case 'shareholders':
              await showShareholders(menuInteraction, client);
              break;
            case 'voice':
              await showVoiceStats(menuInteraction, client);
              break;
            case 'perform_action':
              // Stop the main collector before transitioning to action selector
              collector.stop('menu_transition');
              await showActionSelector(menuInteraction, client);
              break;
          }
        } catch (error: any) {
          console.error('Error handling menu selection:', error);
          
          // Handle "Unknown interaction" error specifically
          if (error.code === 10062) {
            console.log('Interaction expired or already handled');
            return;
          }
          
          // Try to send a follow-up message if the interaction is still valid
          try {
            await menuInteraction.followUp({
              content: '⚠️ An error occurred while processing your request.',
              ephemeral: true
            });
          } catch (followUpError) {
            console.error('Could not send follow-up message:', followUpError);
          }
        }
      });

      collector.on('end', (collected, reason) => {
        // Only remove components if the collector timed out (not if it was stopped for menu transition)
        if (reason === 'time') {
          interaction.editReply({ components: [] }).catch(() => {});
        }
      });

    } catch (error) {
      console.error('Error in controlpanel command:', error);
      
      // Since we deferred at the start, use editReply
      try {
        await interaction.editReply({
          content: '❌ There was an error opening the control panel.'
        });
      } catch (editError: any) {
        // If edit fails, log it but don't throw
        if (editError.code === 10062) {
          console.log('Interaction expired before error message could be sent');
        } else {
          console.error('Error sending error message:', editError);
        }
      }
    }
  }
};

export default controlpanel; 