import { 
  Message, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { MiraClient } from '../client';
import { logger } from '../../utils/logger';

interface ControlPanelReference {
  guildId: string;
  channelId: string;
  messageId: string;
}

export class ControlPanelManager {
  private client: MiraClient;
  private panels: Map<string, ControlPanelReference[]> = new Map(); // guildId -> panel references

  constructor(client: MiraClient) {
    this.client = client;
    
    // Load saved panels from a file or database if needed
    this.loadPanels();
  }
  
  private async loadPanels(): Promise<void> {
    // For now, we'll just log that we're starting fresh
    // In production, you'd want to persist these to a database
    logger.info('ControlPanelManager initialized (panels start empty on restart)');
  }

  /**
   * Register a public control panel for updates
   */
  public registerPanel(guildId: string, channelId: string, messageId: string): void {
    const panels = this.panels.get(guildId) || [];
    panels.push({ guildId, channelId, messageId });
    this.panels.set(guildId, panels);
    logger.info(`✅ Registered control panel for guild ${guildId} in channel ${channelId}, message ${messageId}`);
    logger.info(`Total panels registered: ${this.getTotalPanelCount()}`);
  }

  /**
   * Get total number of panels registered
   */
  public getTotalPanelCount(): number {
    let total = 0;
    for (const panels of this.panels.values()) {
      total += panels.length;
    }
    return total;
  }
  
  /**
   * Get debug information about registered panels
   */
  public getDebugInfo(): string {
    let info = `Total guilds with panels: ${this.panels.size}\n`;
    info += `Total panels: ${this.getTotalPanelCount()}\n\n`;
    
    for (const [guildId, panels] of this.panels.entries()) {
      info += `Guild ${guildId}: ${panels.length} panels\n`;
      panels.forEach(panel => {
        info += `  - Channel: ${panel.channelId}, Message: ${panel.messageId}\n`;
      });
    }
    
    return info;
  }

  /**
   * Update all public control panels with new prices
   */
  public async updateAllPanels(): Promise<void> {
    logger.info(`🔄 Starting update of ${this.getTotalPanelCount()} control panels`);
    
    if (this.panels.size === 0) {
      logger.warn('No control panels registered for updates');
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const [guildId, panels] of this.panels.entries()) {
      logger.debug(`Updating ${panels.length} panels for guild ${guildId}`);
      
      for (const panel of panels) {
        try {
          await this.updatePanel(panel);
          successCount++;
        } catch (error) {
          failCount++;
          logger.error(`❌ Failed to update panel in guild ${guildId}:`, error);
          // Remove panel reference if it fails (message probably deleted)
          this.removePanel(guildId, panel.messageId);
        }
      }
    }
    
    logger.info(`✅ Panel update complete. Success: ${successCount}, Failed: ${failCount}`);
  }

  /**
   * Update a specific control panel
   */
  private async updatePanel(panel: ControlPanelReference): Promise<void> {
    try {
      logger.debug(`Updating panel: ${panel.messageId} in channel ${panel.channelId}`);
      
      const guild = this.client.guilds.cache.get(panel.guildId);
      if (!guild) {
        logger.warn(`Guild ${panel.guildId} not found in cache`);
        return;
      }

      const channel = guild.channels.cache.get(panel.channelId);
      if (!channel || !channel.isTextBased()) {
        logger.warn(`Channel ${panel.channelId} not found or not text-based`);
        return;
      }

      const message = await channel.messages.fetch(panel.messageId);
      if (!message) {
        logger.warn(`Message ${panel.messageId} not found`);
        return;
      }

      // Get updated embeds
      const embeds = await this.createUpdatedEmbeds(panel.guildId);
      
      // Keep the existing components (dropdown menu)
      await message.edit({ embeds });
      
      logger.info(`✅ Successfully updated control panel ${panel.messageId} in guild ${panel.guildId}`);
    } catch (error) {
      logger.error(`Error in updatePanel:`, error);
      throw error;
    }
  }

  /**
   * Create updated embeds with current prices
   */
  public async createUpdatedEmbeds(guildId: string): Promise<EmbedBuilder[]> {
    const server = await this.client.getGuildSettings(guildId);
    if (!server) return [];

    // Import required modules
    const { DEFAULT_ACTIONS } = await import('../../database/models');
    const { adaptiveEconomyService } = await import('../../services/adaptiveEconomyService');
    
    // Get market trends
    const trends = await adaptiveEconomyService.getMarketTrends(guildId);

    // Main embed (stays the same)
    const mainEmbed = new EmbedBuilder()
      .setTitle('🤖 MIRA Payment Terminal')
      .setDescription(
        '**Welcome, citizens!** I am the Robotic Policeman, guardian of order and collector of payments.\n\n' +
        '**Everything has a price.** Use the dropdown menu below to access various functions.\n\n' +
        '*All interactions are private - only you can see your responses.*'
      )
      .setColor(0x800080)
      .setThumbnail(this.client.user?.displayAvatarURL() || '')
      .setFooter({ text: 'Robotic Policeman • Public Terminal' })
      .setTimestamp();

    // Economy embed with current top prices
    const topActions = DEFAULT_ACTIONS
      .filter(action => server.settings.enabledActions.includes(action.id))
      .map(action => {
        const cost = server.settings.actionPrices[action.id] || action.defaultPrice;
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

    // Rules embed (stays the same)
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

    // Menu embed
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

    return [mainEmbed, economyEmbed, rulesEmbed, menuEmbed];
  }

  /**
   * Remove a panel reference
   */
  private removePanel(guildId: string, messageId: string): void {
    const panels = this.panels.get(guildId) || [];
    const filtered = panels.filter(p => p.messageId !== messageId);
    
    if (filtered.length === 0) {
      this.panels.delete(guildId);
    } else {
      this.panels.set(guildId, filtered);
    }
  }

  /**
   * Clean up panels for a guild
   */
  public cleanupGuild(guildId: string): void {
    this.panels.delete(guildId);
    logger.info(`Cleaned up control panels for guild ${guildId}`);
  }
} 