import { 
  SlashCommandBuilder, 
  CommandInteraction, 
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  ComponentType,
  ButtonInteraction
} from 'discord.js';
import { MiraClient } from '../client';
import { Command } from './commandHandler';
import { logger } from '../../utils/logger';

// Import the control panel action handlers
import {
  showBalance,
  showActions,
  showShares,
  showShareholders,
  showVoiceStats,
  showActionSelector
} from './controlpanel';

const setcontrolpanel: Command = {
  data: new SlashCommandBuilder()
    .setName('setcontrolpanel')
    .setDescription('Place a public control panel in a channel (Admin only)')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('The channel to place the control panel in')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) as SlashCommandBuilder,
  
  guildOnly: true,

  async execute(interaction: CommandInteraction, client: MiraClient) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.options.get('channel')?.channel as TextChannel;
    
    if (!channel) {
      await interaction.editReply('❌ Invalid channel specified.');
      return;
    }

    try {
      // Create the main embeds for the public control panel
      const mainEmbed = new EmbedBuilder()
        .setTitle('🤖 MIRA Payment Terminal')
        .setDescription(
          '**Welcome, citizens!** I am the Robotic Policeman, guardian of order and collector of payments.\n\n' +
          '**Everything has a price.** Use the dropdown menu below to access various functions.\n\n' +
          '*All interactions are private - only you can see your responses.*'
        )
        .setColor(0x800080)
        .setThumbnail(client.user?.displayAvatarURL() || '')
        .setFooter({ text: 'Robotic Policeman • Public Terminal' })
        .setTimestamp();

      // Import required modules for price display
      const { DEFAULT_ACTIONS } = await import('../../database/models');
      const { adaptiveEconomyService } = await import('../../services/adaptiveEconomyService');
      
      // Get current prices and trends
      const server = await client.getGuildSettings(interaction.guild!.id);
      const trends = await adaptiveEconomyService.getMarketTrends(interaction.guild!.id);
      
      // Get top 3 most expensive actions for display
      const topActions = DEFAULT_ACTIONS
        .filter(action => server?.settings.enabledActions.includes(action.id))
        .map(action => {
          const cost = server?.settings.actionPrices[action.id] || action.defaultPrice;
          const trend = trends[action.id];
          let trendIndicator = '';
          
          if (trend && trend.priceChange24h !== 0) {
            if (trend.priceChange24h > 0) {
              trendIndicator = ` 📈`;
            } else {
              trendIndicator = ` 📉`;
            }
          }
          
          return { name: action.name, cost, trend: trendIndicator };
        })
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 3);

      const pricePreview = topActions
        .map(action => `• **${action.name}**: ${action.cost.toLocaleString()} tokens${action.trend}`)
        .join('\n');

      const economyEmbed = new EmbedBuilder()
        .setTitle('💰 Token Economy')
        .setDescription('How to earn and spend tokens in our digital dystopia:')
        .setColor(0x00ff00)
        .addFields(
          {
            name: '🎙️ Voice Activity',
            value: '• Earn 1 token per minute in voice channels\n• Must have others present (no solo farming)\n• Some channels may be excluded',
            inline: false
          },
          {
            name: '⚡ Current Top Prices',
            value: pricePreview || '• No actions available',
            inline: false
          },
          {
            name: '📈 Share Market',
            value: '• Buy shares in the server economy\n• Earn dividends from all token spending\n• Limited shares available - become an oligarch!',
            inline: false
          }
        );

      const rulesEmbed = new EmbedBuilder()
        .setTitle('📜 Rules of Engagement')
        .setDescription('The law is absolute. Violations will be... processed.')
        .setColor(0xff0000)
        .addFields(
          {
            name: '🚫 Restrictions',
            value: '• Cannot target yourself\n• Cannot target the server owner\n• Cannot target bot administrators\n• Bot must have necessary permissions',
            inline: false
          },
          {
            name: '⏰ Cooldowns',
            value: '• Each action has a cooldown period\n• Cannot spam the same action\n• Cooldowns are per-user, per-action',
            inline: false
          },
          {
            name: '💸 Dynamic Pricing',
            value: '• Prices update every 15 minutes\n• High demand = prices go up (📈)\n• Low demand = prices go down (📉)\n• Prices can range from 20% to 500% of default',
            inline: false
          }
        );

      const menuEmbed = new EmbedBuilder()
        .setTitle('🎯 Available Functions')
        .setDescription('Select an option from the dropdown menu:')
        .setColor(0x0099ff)
        .addFields(
          {
            name: '💰 Check Balance',
            value: 'View your token balance, share holdings, and earnings',
            inline: true
          },
          {
            name: '🛒 View Actions', 
            value: 'See all available actions and current prices',
            inline: true
          },
          {
            name: '📈 Share Market',
            value: 'Check share prices and market statistics',
            inline: true
          },
          {
            name: '🏆 Shareholders',
            value: 'View the wealthiest citizens leaderboard',
            inline: true
          },
          {
            name: '🎙️ Voice Activity',
            value: 'Check your voice channel participation stats',
            inline: true
          },
          {
            name: '⚡ Perform Action',
            value: 'Use tokens to punish other citizens',
            inline: true
          }
        )
        .setFooter({ text: `Last Updated • Prices change every 15 minutes` })
        .setTimestamp();

      // Create buttons instead of dropdown
      const accessButton = new ButtonBuilder()
        .setCustomId('access_control_panel')
        .setLabel('Access Control Panel')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🤖');

      const infoButton = new ButtonBuilder()
        .setCustomId('control_panel_info')
        .setLabel('How It Works')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❓');

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(accessButton, infoButton);

      // Send the control panel to the specified channel
      const message = await channel.send({ 
        embeds: [mainEmbed, economyEmbed, rulesEmbed, menuEmbed], 
        components: [row]
      });

      // Register this panel for updates
      client.controlPanelManager.registerPanel(interaction.guild!.id, channel.id, message.id);

      // Set up a persistent collector
      const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        // No time limit - this is a permanent panel
      });

      collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
        try {
          if (buttonInteraction.customId === 'access_control_panel') {
            // Create a new ephemeral control panel for this user
            await buttonInteraction.reply({
              content: 'Opening control panel...',
              ephemeral: true
            });
            
            // Import and execute the control panel command directly
            const controlpanelCommand = await import('./controlpanel');
            await controlpanelCommand.default.execute(buttonInteraction as any, client);
          } else if (buttonInteraction.customId === 'control_panel_info') {
            // Show info about how the system works
            const infoEmbed = new EmbedBuilder()
              .setTitle('📖 How MIRA Works')
              .setDescription('Everything you need to know about the token economy:')
              .setColor(0x0099ff)
              .addFields(
                {
                  name: '🎙️ Earning Tokens',
                  value: '• Join voice channels to earn 1 token per minute\n• Must have others in the channel\n• No AFK farming allowed',
                  inline: false
                },
                {
                  name: '💸 Spending Tokens',
                  value: '• Use tokens to perform actions on other users\n• Prices change based on demand\n• Popular actions cost more',
                  inline: false
                },
                {
                  name: '📈 Dynamic Pricing',
                  value: '• Prices update every 15 minutes\n• High demand = higher prices\n• Low demand = lower prices',
                  inline: false
                }
              )
              .setFooter({ text: 'Click "Access Control Panel" to get started!' })
              .setTimestamp();
            
            await buttonInteraction.reply({
              embeds: [infoEmbed],
              ephemeral: true
            });
          }
        } catch (error: any) {
          logger.error('Error handling public control panel button:', error);
          
          if (error.code === 10062) {
            logger.debug('Interaction expired or already handled');
            return;
          }
          
          try {
            if (!buttonInteraction.replied && !buttonInteraction.deferred) {
              await buttonInteraction.reply({
                content: '⚠️ An error occurred while processing your request.',
                ephemeral: true
              });
            } else {
              await buttonInteraction.followUp({
                content: '⚠️ An error occurred while processing your request.',
                ephemeral: true
              });
            }
          } catch (msgError) {
            logger.error('Could not send error message:', msgError);
          }
        }
      });

      await interaction.editReply(`✅ Control panel has been placed in ${channel}!`);
      
      logger.info(`Public control panel placed in channel ${channel.id} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error('Error setting control panel:', error);
      await interaction.editReply('❌ Failed to place the control panel.');
    }
  }
};

export default setcontrolpanel; 