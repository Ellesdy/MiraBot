import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { 
  User, 
  Server, 
  Transaction, 
  UserCooldown, 
  DashboardUser,
  DEFAULT_ACTIONS,
  ServerSettings 
} from './models';
import { logger } from '../utils/logger';

export class Database {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor(dbPath: string = process.env.DATABASE_PATH || './data/mirapay.db') {
    this.dbPath = path.resolve(dbPath);
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        logger.error('Error opening database:', err);
        throw err;
      }
      logger.info(`Database connected: ${this.dbPath}`);
    });

    // Enable foreign keys
    this.db.run('PRAGMA foreign_keys = ON');
  }

  async initialize(): Promise<void> {
    try {
      await this.createTables();
      await this.seedDefaultData();
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Database initialization failed:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    const createTableQueries = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        tokens INTEGER DEFAULT 0,
        totalEarned INTEGER DEFAULT 0,
        totalSpent INTEGER DEFAULT 0,
        lastDaily INTEGER DEFAULT 0,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
      )`,
      
      `CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ownerId TEXT NOT NULL,
        prefix TEXT DEFAULT '!',
        isActive BOOLEAN DEFAULT 1,
        settings TEXT DEFAULT '{}',
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        updatedAt INTEGER DEFAULT (strftime('%s', 'now'))
      )`,
      
      `CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        serverId TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'admin_add', 'admin_remove')),
        amount INTEGER NOT NULL,
        action TEXT,
        targetUserId TEXT,
        description TEXT NOT NULL,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (serverId) REFERENCES servers(id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS user_cooldowns (
        userId TEXT NOT NULL,
        serverId TEXT NOT NULL,
        action TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        PRIMARY KEY (userId, serverId, action),
        FOREIGN KEY (userId) REFERENCES users(id),
        FOREIGN KEY (serverId) REFERENCES servers(id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS dashboard_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discordId TEXT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        discriminator TEXT NOT NULL,
        avatar TEXT,
        accessToken TEXT NOT NULL,
        refreshToken TEXT NOT NULL,
        permissions TEXT DEFAULT '[]',
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        lastLogin INTEGER DEFAULT (strftime('%s', 'now'))
      )`,
      
      `CREATE TABLE IF NOT EXISTS server_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serverId TEXT NOT NULL,
        userId TEXT NOT NULL,
        shares INTEGER NOT NULL DEFAULT 0,
        purchasePrice INTEGER NOT NULL,
        purchasedAt INTEGER DEFAULT (strftime('%s', 'now')),
        totalDividendsEarned INTEGER DEFAULT 0,
        FOREIGN KEY (serverId) REFERENCES servers(id),
        FOREIGN KEY (userId) REFERENCES users(id),
        UNIQUE(serverId, userId)
      )`,
      
      `CREATE TABLE IF NOT EXISTS share_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serverId TEXT NOT NULL,
        userId TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
        shares INTEGER NOT NULL,
        pricePerShare INTEGER NOT NULL,
        totalAmount INTEGER NOT NULL,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (serverId) REFERENCES servers(id),
        FOREIGN KEY (userId) REFERENCES users(id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS dividend_payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serverId TEXT NOT NULL,
        totalAmount INTEGER NOT NULL,
        perShareAmount INTEGER NOT NULL,
        shareholderCount INTEGER NOT NULL,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (serverId) REFERENCES servers(id)
      )`,
      
      // Add new tables for adaptive economy
      `CREATE TABLE IF NOT EXISTS action_usage_stats (
        serverId TEXT NOT NULL,
        actionId TEXT NOT NULL,
        hourlyUsage INTEGER DEFAULT 0,
        dailyUsage INTEGER DEFAULT 0,
        weeklyUsage INTEGER DEFAULT 0,
        lastUsed INTEGER DEFAULT 0,
        totalUsage INTEGER DEFAULT 0,
        lastPriceUpdate INTEGER DEFAULT (strftime('%s', 'now')),
        PRIMARY KEY (serverId, actionId),
        FOREIGN KEY (serverId) REFERENCES servers(id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serverId TEXT NOT NULL,
        actionId TEXT NOT NULL,
        price INTEGER NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('high_demand', 'low_demand', 'manual', 'reset')),
        changePercentage REAL NOT NULL,
        usageAtTime INTEGER NOT NULL,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (serverId) REFERENCES servers(id)
      )`
    ];

    for (const query of createTableQueries) {
      await this.run(query);
    }

    // Create indexes for better performance
    const indexQueries = [
      'CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(userId)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_server ON transactions(serverId)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_cooldowns_expires ON user_cooldowns(expiresAt)',
      'CREATE INDEX IF NOT EXISTS idx_users_tokens ON users(tokens)',
      // Add new indexes for adaptive economy
      'CREATE INDEX IF NOT EXISTS idx_usage_stats_server ON action_usage_stats(serverId)',
      'CREATE INDEX IF NOT EXISTS idx_usage_stats_last_update ON action_usage_stats(lastPriceUpdate)',
      'CREATE INDEX IF NOT EXISTS idx_price_history_server_action ON price_history(serverId, actionId)',
      'CREATE INDEX IF NOT EXISTS idx_price_history_timestamp ON price_history(timestamp)'
    ];

    for (const query of indexQueries) {
      await this.run(query);
    }
  }

  private async seedDefaultData(): Promise<void> {
    // Add any default data seeding here if needed
    logger.info('Default data seeded');
  }

  // User operations
  async getUser(userId: string): Promise<User | null> {
    const row = await this.get('SELECT * FROM users WHERE id = ?', [userId]);
    return row ? row as User : null;
  }

  async createUser(userId: string, initialTokens: number = 0): Promise<User> {
    const now = Math.floor(Date.now() / 1000);
    const user: User = {
      id: userId,
      tokens: initialTokens,
      totalEarned: initialTokens,
      totalSpent: 0,
      lastDaily: 0,
      createdAt: now,
      updatedAt: now
    };

    await this.run(
      'INSERT OR REPLACE INTO users (id, tokens, totalEarned, totalSpent, lastDaily, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.tokens, user.totalEarned, user.totalSpent, user.lastDaily, user.createdAt, user.updatedAt]
    );

    return user;
  }

  async updateUserTokens(userId: string, tokensChange: number, type: 'earn' | 'spend' | 'admin_add' | 'admin_remove'): Promise<User> {
    const user = await this.getUser(userId) || await this.createUser(userId);
    const now = Math.floor(Date.now() / 1000);

    user.tokens += tokensChange;
    if (type === 'earn' || type === 'admin_add') {
      user.totalEarned += Math.abs(tokensChange);
    } else {
      user.totalSpent += Math.abs(tokensChange);
    }
    user.updatedAt = now;

    await this.run(
      'UPDATE users SET tokens = ?, totalEarned = ?, totalSpent = ?, updatedAt = ? WHERE id = ?',
      [user.tokens, user.totalEarned, user.totalSpent, user.updatedAt, user.id]
    );

    return user;
  }

  // LEGACY: Daily rewards are no longer used with voice-based earning
  // async updateUserDaily(userId: string): Promise<void> {
  //   const now = Math.floor(Date.now() / 1000);
  //   await this.run('UPDATE users SET lastDaily = ? WHERE id = ?', [now, userId]);
  // }

  // Server operations
  async getServer(serverId: string): Promise<Server | null> {
    const row = await this.get('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!row) return null;

    return {
      ...row,
      settings: JSON.parse(row.settings || '{}')
    } as Server;
  }

  async createServer(serverId: string, name: string, ownerId: string): Promise<Server> {
    const now = Math.floor(Date.now() / 1000);
    const defaultSettings: ServerSettings = {
      tokenRewards: true,
      dailyTokens: parseInt(process.env.DAILY_TOKEN_REWARD || '100'),
      maxTokensPerUser: parseInt(process.env.MAX_TOKENS_PER_USER || '10000'),
      enabledActions: DEFAULT_ACTIONS.map(a => a.id),
      actionPrices: DEFAULT_ACTIONS.reduce((acc, action) => {
        acc[action.id] = action.defaultPrice;
        return acc;
      }, {} as { [action: string]: number }),
      requiredRoles: [],
      blacklistedUsers: [],
      cooldowns: DEFAULT_ACTIONS.reduce((acc, action) => {
        acc[action.id] = action.cooldown;
        return acc;
      }, {} as { [action: string]: number }),
      voiceActivityRewards: true,
      voiceTokensPerMinute: 1,
      requireOthersInVoice: false,
      excludedVoiceChannels: [],
      // Share system defaults - disabled by default with high barriers
      sharesEnabled: false,
      totalShares: 100, // Only 100 shares available per server
      sharePrice: 10000, // 10,000 tokens per share (very expensive)
      dividendPercentage: 0.5, // 0.5% of all spent tokens go to shareholders
      minSharesToBuy: 1,
      maxSharesPerUser: 10, // Maximum 10% ownership per user
      shareHolderBenefits: ['Shareholder role', 'Access to exclusive channels'],
      // Adaptive economy defaults
      adaptiveEconomy: {
        enabled: true, // Enable by default for dynamic pricing
        updateInterval: 0.25, // Update prices every 15 minutes (0.25 hours)
        priceIncreaseThreshold: 60, // If action is used 60%+ of average, increase price (lowered from 70)
        priceDecreaseThreshold: 40, // If action is used 40%- of average, decrease price (raised from 30)
        maxPriceMultiplier: 5.0, // Prices can go up to 5x the default (increased from 3x)
        minPriceMultiplier: 0.2, // Prices can go down to 20% of default (decreased from 30%)
        priceChangeRate: 20, // Change prices by 20% each adjustment (doubled from 10%)
        volatilityFactor: 1.5 // High volatility (1.5 = 50% more responsive to demand changes)
      }
    };

    const server: Server = {
      id: serverId,
      name,
      ownerId,
      prefix: process.env.DEFAULT_PREFIX || '!',
      isActive: true,
      settings: defaultSettings,
      createdAt: now,
      updatedAt: now
    };

    await this.run(
      'INSERT OR REPLACE INTO servers (id, name, ownerId, prefix, isActive, settings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [server.id, server.name, server.ownerId, server.prefix, server.isActive, JSON.stringify(server.settings), server.createdAt, server.updatedAt]
    );

    // Initialize action usage stats for this server
    for (const action of DEFAULT_ACTIONS) {
      await this.run(
        'INSERT OR IGNORE INTO action_usage_stats (serverId, actionId) VALUES (?, ?)',
        [serverId, action.id]
      );
    }

    return server;
  }

  async updateServerSettings(serverId: string, settings: Partial<ServerSettings>): Promise<void> {
    const server = await this.getServer(serverId);
    if (!server) throw new Error('Server not found');

    const updatedSettings = { ...server.settings, ...settings };
    const now = Math.floor(Date.now() / 1000);

    await this.run(
      'UPDATE servers SET settings = ?, updatedAt = ? WHERE id = ?',
      [JSON.stringify(updatedSettings), now, serverId]
    );
  }

  // Transaction operations
  async addTransaction(transaction: Omit<Transaction, 'id' | 'timestamp'>): Promise<number> {
    const result = await this.run(
      'INSERT INTO transactions (userId, serverId, type, amount, action, targetUserId, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [transaction.userId, transaction.serverId, transaction.type, transaction.amount, transaction.action, transaction.targetUserId, transaction.description]
    );
    return result.lastID!;
  }

  async getUserTransactions(userId: string, limit: number = 50): Promise<Transaction[]> {
    const rows = await this.all(
      'SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC LIMIT ?',
      [userId, limit]
    );
    return rows as Transaction[];
  }

  async getServerTransactions(serverId: string, limit: number = 100): Promise<Transaction[]> {
    const rows = await this.all(
      'SELECT * FROM transactions WHERE serverId = ? ORDER BY timestamp DESC LIMIT ?',
      [serverId, limit]
    );
    return rows as Transaction[];
  }

  // Cooldown operations
  async setCooldown(userId: string, serverId: string, action: string, duration: number): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + Math.floor(duration / 1000);
    await this.run(
      'INSERT OR REPLACE INTO user_cooldowns (userId, serverId, action, expiresAt) VALUES (?, ?, ?, ?)',
      [userId, serverId, action, expiresAt]
    );
  }

  async getCooldown(userId: string, serverId: string, action: string): Promise<UserCooldown | null> {
    const row = await this.get(
      'SELECT * FROM user_cooldowns WHERE userId = ? AND serverId = ? AND action = ? AND expiresAt > strftime("%s", "now")',
      [userId, serverId, action]
    );
    return row ? row as UserCooldown : null;
  }

  async cleanupExpiredCooldowns(): Promise<void> {
    await this.run('DELETE FROM user_cooldowns WHERE expiresAt <= strftime("%s", "now")');
  }

  // Share management operations
  async getUserShares(userId: string, serverId: string): Promise<number> {
    const row = await this.get(
      'SELECT shares FROM server_shares WHERE userId = ? AND serverId = ?',
      [userId, serverId]
    );
    return row ? row.shares : 0;
  }

  async getServerShareholders(serverId: string): Promise<any[]> {
    return await this.all(
      'SELECT * FROM server_shares WHERE serverId = ? AND shares > 0 ORDER BY shares DESC',
      [serverId]
    );
  }

  async buyShares(userId: string, serverId: string, shares: number, pricePerShare: number): Promise<boolean> {
    try {
      const totalCost = shares * pricePerShare;
      
      // Start transaction
      await this.run('BEGIN TRANSACTION');
      
      // Check if user can afford
      const user = await this.getUser(userId);
      if (!user || user.tokens < totalCost) {
        await this.run('ROLLBACK');
        return false;
      }
      
      // Deduct tokens
      await this.updateUserTokens(userId, -totalCost, 'spend');
      
      // Update or create share holding
      const existingShares = await this.getUserShares(userId, serverId);
      if (existingShares > 0) {
        await this.run(
          'UPDATE server_shares SET shares = shares + ?, purchasePrice = ? WHERE userId = ? AND serverId = ?',
          [shares, pricePerShare, userId, serverId]
        );
      } else {
        await this.run(
          'INSERT INTO server_shares (serverId, userId, shares, purchasePrice) VALUES (?, ?, ?, ?)',
          [serverId, userId, shares, pricePerShare]
        );
      }
      
      // Record transaction
      await this.run(
        'INSERT INTO share_transactions (serverId, userId, type, shares, pricePerShare, totalAmount) VALUES (?, ?, ?, ?, ?, ?)',
        [serverId, userId, 'buy', shares, pricePerShare, totalCost]
      );
      
      await this.run('COMMIT');
      return true;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  async sellShares(userId: string, serverId: string, shares: number, pricePerShare: number): Promise<boolean> {
    try {
      const totalValue = shares * pricePerShare;
      
      await this.run('BEGIN TRANSACTION');
      
      // Check if user has enough shares
      const currentShares = await this.getUserShares(userId, serverId);
      if (currentShares < shares) {
        await this.run('ROLLBACK');
        return false;
      }
      
      // Update shares
      await this.run(
        'UPDATE server_shares SET shares = shares - ? WHERE userId = ? AND serverId = ?',
        [shares, userId, serverId]
      );
      
      // Add tokens to user
      await this.updateUserTokens(userId, totalValue, 'earn');
      
      // Record transaction
      await this.run(
        'INSERT INTO share_transactions (serverId, userId, type, shares, pricePerShare, totalAmount) VALUES (?, ?, ?, ?, ?, ?)',
        [serverId, userId, 'sell', shares, pricePerShare, totalValue]
      );
      
      await this.run('COMMIT');
      return true;
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  async distributeDividends(serverId: string, spentAmount: number): Promise<void> {
    try {
      const server = await this.getServer(serverId);
      if (!server?.settings.sharesEnabled || server.settings.dividendPercentage <= 0) {
        return;
      }
      
      const dividendPool = Math.floor(spentAmount * (server.settings.dividendPercentage / 100));
      if (dividendPool <= 0) return;
      
      // Get all shareholders
      const shareholders = await this.getServerShareholders(serverId);
      if (shareholders.length === 0) return;
      
      const totalShares = shareholders.reduce((sum, holder) => sum + holder.shares, 0);
      const perShareAmount = Math.floor(dividendPool / totalShares);
      
      if (perShareAmount <= 0) return;
      
      await this.run('BEGIN TRANSACTION');
      
      // Distribute dividends
      for (const holder of shareholders) {
        const dividend = holder.shares * perShareAmount;
        
        // Add tokens
        await this.updateUserTokens(holder.userId, dividend, 'earn');
        
        // Update total dividends earned
        await this.run(
          'UPDATE server_shares SET totalDividendsEarned = totalDividendsEarned + ? WHERE userId = ? AND serverId = ?',
          [dividend, holder.userId, serverId]
        );
        
        // Record dividend transaction
        await this.run(
          'INSERT INTO share_transactions (serverId, userId, type, shares, pricePerShare, totalAmount) VALUES (?, ?, ?, ?, ?, ?)',
          [serverId, holder.userId, 'dividend', holder.shares, perShareAmount, dividend]
        );
      }
      
      // Record payout
      await this.run(
        'INSERT INTO dividend_payouts (serverId, totalAmount, perShareAmount, shareholderCount) VALUES (?, ?, ?, ?)',
        [serverId, dividendPool, perShareAmount, shareholders.length]
      );
      
      await this.run('COMMIT');
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }

  async getShareTransactions(userId: string, serverId?: string, limit: number = 50): Promise<any[]> {
    if (serverId) {
      return await this.all(
        'SELECT * FROM share_transactions WHERE userId = ? AND serverId = ? ORDER BY timestamp DESC LIMIT ?',
        [userId, serverId, limit]
      );
    } else {
      return await this.all(
        'SELECT * FROM share_transactions WHERE userId = ? ORDER BY timestamp DESC LIMIT ?',
        [userId, limit]
      );
    }
  }

  async getServerShareStats(serverId: string): Promise<{
    totalSharesSold: number;
    totalShareValue: number;
    averageSharePrice: number;
    shareholderCount: number;
    totalDividendsPaid: number;
  }> {
    const shareholders = await this.getServerShareholders(serverId);
    const totalSharesSold = shareholders.reduce((sum, holder) => sum + holder.shares, 0);
    const totalShareValue = shareholders.reduce((sum, holder) => sum + (holder.shares * holder.purchasePrice), 0);
    const averageSharePrice = totalSharesSold > 0 ? Math.floor(totalShareValue / totalSharesSold) : 0;
    
    const dividendStats = await this.get(
      'SELECT COUNT(*) as payoutCount, SUM(totalAmount) as totalPaid FROM dividend_payouts WHERE serverId = ?',
      [serverId]
    );
    
    return {
      totalSharesSold,
      totalShareValue,
      averageSharePrice,
      shareholderCount: shareholders.length,
      totalDividendsPaid: dividendStats?.totalPaid || 0
    };
  }

  // Adaptive Economy Methods
  async trackActionUsage(serverId: string, actionId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const oneHourAgo = now - 3600;
    const oneDayAgo = now - 86400;
    const oneWeekAgo = now - 604800;

    // Get recent usage counts from transactions
    const hourlyCount = await this.get(
      'SELECT COUNT(*) as count FROM transactions WHERE serverId = ? AND action = ? AND timestamp > ?',
      [serverId, actionId, oneHourAgo]
    );

    const dailyCount = await this.get(
      'SELECT COUNT(*) as count FROM transactions WHERE serverId = ? AND action = ? AND timestamp > ?',
      [serverId, actionId, oneDayAgo]
    );

    const weeklyCount = await this.get(
      'SELECT COUNT(*) as count FROM transactions WHERE serverId = ? AND action = ? AND timestamp > ?',
      [serverId, actionId, oneWeekAgo]
    );

    // Update usage stats
    await this.run(
      `INSERT INTO action_usage_stats (serverId, actionId, hourlyUsage, dailyUsage, weeklyUsage, lastUsed, totalUsage) 
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(serverId, actionId) DO UPDATE SET 
         hourlyUsage = ?,
         dailyUsage = ?,
         weeklyUsage = ?,
         lastUsed = ?,
         totalUsage = totalUsage + 1`,
      [serverId, actionId, hourlyCount.count, dailyCount.count, weeklyCount.count, now,
       hourlyCount.count, dailyCount.count, weeklyCount.count, now]
    );
  }

  async getActionUsageStats(serverId: string, actionId?: string): Promise<any> {
    if (actionId) {
      return await this.get(
        'SELECT * FROM action_usage_stats WHERE serverId = ? AND actionId = ?',
        [serverId, actionId]
      );
    }
    return await this.all(
      'SELECT * FROM action_usage_stats WHERE serverId = ?',
      [serverId]
    );
  }

  async updateActionPrice(serverId: string, actionId: string, newPrice: number, reason: string, changePercentage: number): Promise<void> {
    const usageStats = await this.getActionUsageStats(serverId, actionId);
    const now = Math.floor(Date.now() / 1000);

    // Record price change in history
    await this.run(
      'INSERT INTO price_history (serverId, actionId, price, reason, changePercentage, usageAtTime) VALUES (?, ?, ?, ?, ?, ?)',
      [serverId, actionId, newPrice, reason, changePercentage, usageStats?.totalUsage || 0]
    );

    // Update server settings with new price
    const server = await this.getServer(serverId);
    if (server) {
      server.settings.actionPrices[actionId] = newPrice;
      await this.updateServerSettings(serverId, { actionPrices: server.settings.actionPrices });
    }

    // Update last price update timestamp
    await this.run(
      'UPDATE action_usage_stats SET lastPriceUpdate = ? WHERE serverId = ? AND actionId = ?',
      [now, serverId, actionId]
    );
  }

  async getPriceHistory(serverId: string, actionId?: string, limit: number = 50): Promise<any[]> {
    if (actionId) {
      return await this.all(
        'SELECT * FROM price_history WHERE serverId = ? AND actionId = ? ORDER BY timestamp DESC LIMIT ?',
        [serverId, actionId, limit]
      );
    }
    return await this.all(
      'SELECT * FROM price_history WHERE serverId = ? ORDER BY timestamp DESC LIMIT ?',
      [serverId, limit]
    );
  }

  async getAverageActionUsage(serverId: string): Promise<number> {
    const result = await this.get(
      'SELECT AVG(hourlyUsage) as avgUsage FROM action_usage_stats WHERE serverId = ?',
      [serverId]
    );
    return result?.avgUsage || 0;
  }

  async resetActionUsageStats(): Promise<void> {
    // This method can be called periodically to reset short-term usage stats
    // while preserving totalUsage and lastUsed
    await this.run(
      `UPDATE action_usage_stats 
       SET hourlyUsage = 0, dailyUsage = 0, weeklyUsage = 0 
       WHERE lastUsed < strftime('%s', 'now') - 604800` // Reset if not used in a week
    );
  }

  // Public utility methods for adaptive economy
  async getAllServersWithAdaptiveEconomy(): Promise<{ id: string }[]> {
    return await this.all('SELECT id FROM servers WHERE json_extract(settings, "$.adaptiveEconomy.enabled") = 1');
  }

  async cleanOldPriceHistory(daysToKeep: number = 30): Promise<void> {
    const cutoffTime = Math.floor(Date.now() / 1000) - (daysToKeep * 86400);
    await this.run('DELETE FROM price_history WHERE timestamp < ?', [cutoffTime]);
  }

  // Utility methods
  private run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  private get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  private all(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export const database = new Database(); 