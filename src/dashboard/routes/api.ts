import { Router, Request, Response } from 'express';
import { MiraClient } from '../../bot/client';
import { database } from '../../database/database';
import { logger } from '../../utils/logger';
import { requireAuth } from './auth';

const apiRouter = Router();

// Bot stats endpoint
apiRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    // For now, return placeholder stats
    // In production, this would connect to the bot instance
    const stats = {
      guilds: 0,
      users: 0,
      voiceConnections: 0,
      uptime: 0,
      status: 'online'
    };
    
    res.json(stats);
  } catch (error) {
    logger.error('Stats API error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// User balance endpoint
apiRouter.get('/user/balance', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const user = await database.getUser(userId);
    
    res.json({
      userId,
      tokens: user?.tokens || 0,
      totalEarned: user?.totalEarned || 0,
      totalSpent: user?.totalSpent || 0
    });
  } catch (error) {
    logger.error('Balance API error:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// User transactions endpoint
apiRouter.get('/user/transactions', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const transactions = await database.getUserTransactions(userId, limit);
    
    res.json({ transactions });
  } catch (error) {
    logger.error('Transactions API error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Server list endpoint (for users with admin permissions)
apiRouter.get('/servers', requireAuth, async (req: Request, res: Response) => {
  try {
    const userGuilds = req.session.user!.guilds || [];
    
    // Filter to only guilds where user has admin permissions
    const adminGuilds = userGuilds.filter((guild: any) => {
      const permissions = BigInt(guild.permissions);
      return (permissions & BigInt(0x8)) === BigInt(0x8); // ADMINISTRATOR permission
    });
    
    res.json({ guilds: adminGuilds });
  } catch (error) {
    logger.error('Servers API error:', error);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

// Server settings endpoint
apiRouter.get('/server/:serverId/settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const userId = req.session.user!.id;
    
    // Verify user has permission to view this server
    const userGuilds = req.session.user!.guilds || [];
    const guild = userGuilds.find((g: any) => g.id === serverId);
    
    if (!guild) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const permissions = BigInt(guild.permissions);
    if ((permissions & BigInt(0x8)) !== BigInt(0x8)) {
      return res.status(403).json({ error: 'Admin permission required' });
    }
    
    const server = await database.getServer(serverId);
    
    return res.json({ server });
  } catch (error) {
    logger.error('Server settings API error:', error);
    return res.status(500).json({ error: 'Failed to fetch server settings' });
  }
});

// Update server settings endpoint
apiRouter.put('/server/:serverId/settings', requireAuth, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const userId = req.session.user!.id;
    
    // Verify user has permission to update this server
    const userGuilds = req.session.user!.guilds || [];
    const guild = userGuilds.find((g: any) => g.id === serverId);
    
    if (!guild) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const permissions = BigInt(guild.permissions);
    if ((permissions & BigInt(0x8)) !== BigInt(0x8)) {
      return res.status(403).json({ error: 'Admin permission required' });
    }
    
    // Update settings
    await database.updateServerSettings(serverId, req.body);
    
    logger.info(`Server settings updated for ${serverId} by user ${userId}`);
    return res.json({ success: true });
  } catch (error) {
    logger.error('Update settings API error:', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

export { apiRouter }; 