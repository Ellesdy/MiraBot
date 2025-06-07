import { ShardingManager } from 'discord.js';
import { config } from './utils/config';
import { logger } from './utils/logger';
import path from 'path';

async function startBot() {
  try {
    logger.info('Starting MIRA Discord Bot with sharding...');
    
    const manager = new ShardingManager(path.join(__dirname, 'bot.js'), {
      token: config.discord.token,
      totalShards: config.discord.shardCount,
      shardList: 'auto',
      mode: 'process',
      respawn: true,
    });

    manager.on('shardCreate', shard => {
      logger.info(`Launched shard ${shard.id}`);
      
      shard.on('ready', () => {
        logger.info(`Shard ${shard.id} is ready`);
      });

      shard.on('disconnect', () => {
        logger.warn(`Shard ${shard.id} disconnected`);
      });

      shard.on('reconnecting', () => {
        logger.info(`Shard ${shard.id} is reconnecting`);
      });

      shard.on('death', () => {
        logger.error(`Shard ${shard.id} died`);
      });
    });

    await manager.spawn();
    logger.info('All shards spawned successfully');
  } catch (error) {
    logger.error('Failed to start sharding manager:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

if (require.main === module) {
  startBot();
} 