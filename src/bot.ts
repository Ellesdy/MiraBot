import { MiraClient } from './bot/client';
import { logger } from './utils/logger';

async function startBot() {
  try {
    const client = new MiraClient();
    await client.start();
    
    // Graceful shutdown handling
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down bot...');
      await client.shutdown();
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down bot...');
      await client.shutdown();
    });

  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

startBot(); 