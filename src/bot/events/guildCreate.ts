import { Events, Guild } from 'discord.js';
import { MiraClient } from '../client';
import { logger } from '../../utils/logger';
import { database } from '../../database/database';
import { Event } from './eventHandler';

const guildCreate: Event = {
  name: Events.GuildCreate,
  async execute(guild: Guild) {
    const client = guild.client as MiraClient;
    
    try {
      logger.info(`Joined new guild: ${guild.name} (${guild.id}) with ${guild.memberCount} members`);
      
      // Create server configuration in database
      await database.createServer(guild.id, guild.name, guild.ownerId);
      
      // Send welcome message to the first available text channel
      const welcomeChannel = guild.channels.cache
        .filter(channel => channel.isTextBased() && channel.permissionsFor(guild.members.me!)?.has('SendMessages'))
        .first();
      
      if (welcomeChannel && welcomeChannel.isTextBased()) {
        const welcomeEmbed = {
          title: '🎉 Welcome to MIRA!',
          description: `Thank you for adding MIRA to **${guild.name}**!\n\n` +
                      `MIRA is a voice-activity-based token system that rewards users for being active in voice channels.\n\n` +
                      `**Quick Start:**\n` +
                      `• Use \`/balance\` to check your tokens\n` +
                      `• Use \`/voice\` to check voice activity\n` +
                      `• Use \`/purchase\` to buy tokens with real money\n` +
                      `• Use \`/actions\` to see available actions\n` +
                      `• Use \`/settings\` (admins only) to configure the bot\n\n` +
                      `**How to Earn Tokens:**\n` +
                      `• Join any voice channel to start earning\n` +
                      `• Earn 1 token per minute while active in voice\n` +
                      `• Purchase tokens instantly with \`/purchase\`\n\n` +
                      `**Example Actions:**\n` +
                      `• Change nickname - 5 tokens\n` +
                      `• Timeout (5 min) - 200 tokens\n` +
                      `• Voice disconnect - 50 tokens\n` +
                      `• Send DM - 10 tokens\n` +
                      `• And more!\n\n` +
                      `Start earning tokens by joining a voice channel!`,
          color: 0x00ff00,
          footer: {
            text: 'Use /help for more information'
          },
          timestamp: new Date().toISOString()
        };
        
        await (welcomeChannel as any).send({ embeds: [welcomeEmbed] });
      }
      
      logger.info(`Successfully set up guild: ${guild.name}`);
    } catch (error) {
      logger.error(`Error setting up guild ${guild.name}:`, error);
    }
  },
};

export default guildCreate; 