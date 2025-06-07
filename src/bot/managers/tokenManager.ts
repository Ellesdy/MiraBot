import { MiraClient } from '../client';
import { database } from '../../database/database';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';
import { User } from '../../database/models';

export class TokenManager {
  private client: MiraClient;

  constructor(client: MiraClient) {
    this.client = client;
  }

  async getUserTokens(userId: string): Promise<number> {
    const user = await database.getUser(userId);
    return user?.tokens || 0;
  }

  async addTokens(userId: string, amount: number, reason: string, serverId?: string): Promise<User> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const user = await database.updateUserTokens(userId, amount, 'earn');
    
    if (serverId) {
      await database.addTransaction({
        userId,
        serverId,
        type: 'earn',
        amount,
        description: reason
      });
    }

    logger.info(`Added ${amount} tokens to user ${userId}: ${reason}`);
    return user;
  }

  async removeTokens(userId: string, amount: number, reason: string, serverId?: string): Promise<User> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const user = await database.getUser(userId);
    if (!user || user.tokens < amount) {
      throw new Error('Insufficient tokens');
    }

    const updatedUser = await database.updateUserTokens(userId, -amount, 'spend');
    
    if (serverId) {
      await database.addTransaction({
        userId,
        serverId,
        type: 'spend',
        amount: -amount,
        description: reason
      });
    }

    logger.info(`Removed ${amount} tokens from user ${userId}: ${reason}`);
    return updatedUser;
  }

  async canAfford(userId: string, amount: number): Promise<boolean> {
    const tokens = await this.getUserTokens(userId);
    return tokens >= amount;
  }

  async spendTokens(userId: string, amount: number, action: string, serverId: string, targetUserId?: string): Promise<boolean> {
    try {
      if (!await this.canAfford(userId, amount)) {
        return false;
      }

      await database.updateUserTokens(userId, -amount, 'spend');
      
      await database.addTransaction({
        userId,
        serverId,
        type: 'spend',
        amount: -amount,
        action,
        targetUserId,
        description: `Spent tokens on ${action}${targetUserId ? ` for user ${targetUserId}` : ''}`
      });

      // Distribute dividends to shareholders
      await database.distributeDividends(serverId, amount);

      logger.info(`User ${userId} spent ${amount} tokens on ${action} in server ${serverId}`);
      return true;
    } catch (error) {
      logger.error('Error spending tokens:', error);
      return false;
    }
  }

  async getTopUsers(serverId: string, limit: number = 10): Promise<Array<{ userId: string; tokens: number }>> {
    // This is a simplified version - in a real implementation you'd want to track server-specific stats
    const transactions = await database.getServerTransactions(serverId, 1000);
    const userTotals = new Map<string, number>();

    for (const transaction of transactions) {
      const current = userTotals.get(transaction.userId) || 0;
      userTotals.set(transaction.userId, current + (transaction.type === 'earn' ? transaction.amount : 0));
    }

    return Array.from(userTotals.entries())
      .map(([userId, tokens]) => ({ userId, tokens }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, limit);
  }

  async getUserStats(userId: string): Promise<{
    tokens: number;
    totalEarned: number;
    totalSpent: number;
    rank?: number;
  }> {
    const user = await database.getUser(userId) || await database.createUser(userId);
    
    return {
      tokens: user.tokens,
      totalEarned: user.totalEarned,
      totalSpent: user.totalSpent
    };
  }

  async transferTokens(fromUserId: string, toUserId: string, amount: number, serverId: string): Promise<boolean> {
    try {
      if (!await this.canAfford(fromUserId, amount)) {
        return false;
      }

      // Remove from sender
      await database.updateUserTokens(fromUserId, -amount, 'spend');
      await database.addTransaction({
        userId: fromUserId,
        serverId,
        type: 'spend',
        amount: -amount,
        targetUserId: toUserId,
        description: `Transfer to user ${toUserId}`
      });

      // Add to receiver
      await database.updateUserTokens(toUserId, amount, 'earn');
      await database.addTransaction({
        userId: toUserId,
        serverId,
        type: 'earn',
        amount,
        targetUserId: fromUserId,
        description: `Transfer from user ${fromUserId}`
      });

      logger.info(`Transferred ${amount} tokens from ${fromUserId} to ${toUserId}`);
      return true;
    } catch (error) {
      logger.error('Error transferring tokens:', error);
      return false;
    }
  }

  // Admin functions
  async adminAddTokens(adminId: string, targetUserId: string, amount: number, reason: string, serverId: string): Promise<boolean> {
    try {
      await database.updateUserTokens(targetUserId, amount, 'admin_add');
      
      await database.addTransaction({
        userId: targetUserId,
        serverId,
        type: 'admin_add',
        amount,
        description: `Admin ${adminId}: ${reason}`
      });

      logger.info(`Admin ${adminId} added ${amount} tokens to user ${targetUserId}: ${reason}`);
      return true;
    } catch (error) {
      logger.error('Error adding tokens (admin):', error);
      return false;
    }
  }

  async adminRemoveTokens(adminId: string, targetUserId: string, amount: number, reason: string, serverId: string): Promise<boolean> {
    try {
      await database.updateUserTokens(targetUserId, -amount, 'admin_remove');
      
      await database.addTransaction({
        userId: targetUserId,
        serverId,
        type: 'admin_remove',
        amount: -amount,
        description: `Admin ${adminId}: ${reason}`
      });

      logger.info(`Admin ${adminId} removed ${amount} tokens from user ${targetUserId}: ${reason}`);
      return true;
    } catch (error) {
      logger.error('Error removing tokens (admin):', error);
      return false;
    }
  }
} 