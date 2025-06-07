import { Events } from 'discord.js';
import { MiraClient } from '../client';
import { logger } from '../../utils/logger';
import { Event } from './eventHandler';

const ready: Event = {
  name: Events.ClientReady,
  once: true,
  async execute(client: MiraClient) {
    logger.info(`Bot ready! Logged in as ${client.user?.tag}`);
    logger.info(`Serving ${client.guilds.cache.size} guilds`);
    
    // Set bot status
    client.user?.setActivity('MiraPay | Token-based actions', { type: 0 });
    
    // Deploy commands if needed
    try {
      await client.deployCommands();
      logger.info('Commands deployed successfully');
    } catch (error) {
      logger.error('Failed to deploy commands:', error);
    }
    
    logger.info('MiraPay Bot is now fully operational!');
  },
};

export default ready; 