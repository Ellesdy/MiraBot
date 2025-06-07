import { Router, Request, Response } from 'express';
import { database } from '../../database/database';
import { logger } from '../../utils/logger';
import { requireAuth } from './auth';

const dashboardRouter = Router();

// Main dashboard page
dashboardRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const user = await database.getUser(userId);
    const transactions = await database.getUserTransactions(userId, 10);
    
    res.render('dashboard', {
      user: req.session.user,
      balance: user?.tokens || 0,
      totalEarned: user?.totalEarned || 0,
      totalSpent: user?.totalSpent || 0,
      transactions
    });
  } catch (error) {
    logger.error('Dashboard error:', error);
    res.render('error', { message: 'Failed to load dashboard' });
  }
});

// Server management page
dashboardRouter.get('/servers', requireAuth, async (req: Request, res: Response) => {
  try {
    const userGuilds = req.session.user!.guilds || [];
    
    // Filter to only guilds where user has admin permissions
    const adminGuilds = userGuilds.filter((guild: any) => {
      const permissions = BigInt(guild.permissions);
      return (permissions & BigInt(0x8)) === BigInt(0x8); // ADMINISTRATOR permission
    });
    
    res.render('servers', {
      user: req.session.user,
      guilds: adminGuilds
    });
  } catch (error) {
    logger.error('Servers page error:', error);
    res.render('error', { message: 'Failed to load servers' });
  }
});

// Server settings page
dashboardRouter.get('/server/:serverId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const userGuilds = req.session.user!.guilds || [];
    const guild = userGuilds.find((g: any) => g.id === serverId);
    
    if (!guild) {
      return res.render('error', { message: 'Server not found' });
    }
    
    const permissions = BigInt(guild.permissions);
    if ((permissions & BigInt(0x8)) !== BigInt(0x8)) {
      return res.render('error', { message: 'Admin permission required' });
    }
    
    const server = await database.getServer(serverId);
    
    res.render('server-settings', {
      user: req.session.user,
      guild,
      server
    });
  } catch (error) {
    logger.error('Server settings page error:', error);
    res.render('error', { message: 'Failed to load server settings' });
  }
});

// Transactions page
dashboardRouter.get('/transactions', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const transactions = await database.getUserTransactions(userId, 100);
    
    res.render('transactions', {
      user: req.session.user,
      transactions
    });
  } catch (error) {
    logger.error('Transactions page error:', error);
    res.render('error', { message: 'Failed to load transactions' });
  }
});

// Shares portfolio page
dashboardRouter.get('/shares', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.user!.id;
    const userGuilds = req.session.user!.guilds || [];
    
    // This is a placeholder - in production, you'd fetch actual share data
    const investments: any[] = [];
    const availableServers: any[] = [];
    
    // Calculate portfolio stats
    const totalInvestment = investments.reduce((sum, inv) => sum + inv.purchaseValue, 0);
    const currentValue = investments.reduce((sum, inv) => sum + inv.currentValue, 0);
    const totalDividends = investments.reduce((sum, inv) => sum + inv.dividendsEarned, 0);
    const totalReturn = currentValue + totalDividends - totalInvestment;
    
    res.render('shares', {
      user: req.session.user,
      investments,
      availableServers,
      totalInvestment,
      currentValue,
      totalDividends,
      totalReturn
    });
  } catch (error) {
    logger.error('Shares portfolio page error:', error);
    res.render('error', { message: 'Failed to load share portfolio' });
  }
});

export { dashboardRouter }; 