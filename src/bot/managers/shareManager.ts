import { MiraClient } from '../client';
import { database } from '../../database/database';
import { logger } from '../../utils/logger';
import { EmbedBuilder, TextChannel, NewsChannel } from 'discord.js';

export class ShareManager {
  private client: MiraClient;

  constructor(client: MiraClient) {
    this.client = client;
  }

  async getShareInfo(serverId: string): Promise<{
    enabled: boolean;
    totalShares: number;
    availableShares: number;
    sharePrice: number;
    dividendPercentage: number;
    maxSharesPerUser: number;
    minSharesToBuy: number;
  }> {
    const server = await database.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const stats = await database.getServerShareStats(serverId);
    const availableShares = server.settings.totalShares - stats.totalSharesSold;

    return {
      enabled: server.settings.sharesEnabled,
      totalShares: server.settings.totalShares,
      availableShares,
      sharePrice: server.settings.sharePrice,
      dividendPercentage: server.settings.dividendPercentage,
      maxSharesPerUser: server.settings.maxSharesPerUser,
      minSharesToBuy: server.settings.minSharesToBuy
    };
  }

  async getUserShareInfo(userId: string, serverId: string): Promise<{
    shares: number;
    percentage: number;
    totalDividendsEarned: number;
    estimatedDailyDividend: number;
  }> {
    const server = await database.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    const shares = await database.getUserShares(userId, serverId);
    const percentage = (shares / server.settings.totalShares) * 100;

    // Get share holder record for total dividends
    const shareholders = await database.getServerShareholders(serverId);
    const shareholderRecord = shareholders.find(s => s.userId === userId);
    const totalDividendsEarned = shareholderRecord?.totalDividendsEarned || 0;

    // Estimate daily dividends based on recent server activity
    const recentTransactions = await database.getServerTransactions(serverId, 100);
    const spendTransactions = recentTransactions.filter(t => t.type === 'spend');
    const totalSpent = spendTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const averageDailySpend = totalSpent / 7; // Assume 100 transactions = ~7 days
    const estimatedDailyDividend = Math.floor(
      (averageDailySpend * (server.settings.dividendPercentage / 100)) * (shares / server.settings.totalShares)
    );

    return {
      shares,
      percentage,
      totalDividendsEarned,
      estimatedDailyDividend
    };
  }

  async canBuyShares(userId: string, serverId: string, amount: number): Promise<{
    canBuy: boolean;
    reason?: string;
  }> {
    const server = await database.getServer(serverId);
    if (!server) {
      return { canBuy: false, reason: 'Server not found' };
    }

    if (!server.settings.sharesEnabled) {
      return { canBuy: false, reason: 'Share system is not enabled on this server' };
    }

    if (amount < server.settings.minSharesToBuy) {
      return { canBuy: false, reason: `Minimum purchase is ${server.settings.minSharesToBuy} shares` };
    }

    const currentShares = await database.getUserShares(userId, serverId);
    if (currentShares + amount > server.settings.maxSharesPerUser) {
      return { 
        canBuy: false, 
        reason: `You can only own up to ${server.settings.maxSharesPerUser} shares (you have ${currentShares})` 
      };
    }

    const stats = await database.getServerShareStats(serverId);
    const availableShares = server.settings.totalShares - stats.totalSharesSold;
    if (amount > availableShares) {
      return { 
        canBuy: false, 
        reason: `Only ${availableShares} shares are available for purchase` 
      };
    }

    const totalCost = amount * server.settings.sharePrice;
    const userTokens = await this.client.tokenManager.getUserTokens(userId);
    if (userTokens < totalCost) {
      return { 
        canBuy: false, 
        reason: `Insufficient tokens. You need ${totalCost.toLocaleString()} tokens (you have ${userTokens.toLocaleString()})` 
      };
    }

    return { canBuy: true };
  }

  async buyShares(userId: string, serverId: string, amount: number): Promise<boolean> {
    const server = await database.getServer(serverId);
    if (!server) return false;

    const result = await database.buyShares(userId, serverId, amount, server.settings.sharePrice);
    
    if (result) {
      logger.info(`User ${userId} bought ${amount} shares in server ${serverId} for ${amount * server.settings.sharePrice} tokens`);
      
      // Announce significant purchases (5+ shares)
      if (amount >= 5 && server.settings.announcementChannel) {
        const channel = this.client.channels.cache.get(server.settings.announcementChannel);
        if (channel && (channel instanceof TextChannel || channel instanceof NewsChannel)) {
          const user = await this.client.users.fetch(userId);
          const embed = new EmbedBuilder()
            .setTitle('📈 New Shareholder!')
            .setDescription(`${user.username} has purchased **${amount} shares** in this server!`)
            .setColor(0x00ff00)
            .addFields(
              { name: 'Total Investment', value: `${(amount * server.settings.sharePrice).toLocaleString()} tokens`, inline: true },
              { name: 'Ownership', value: `${((amount / server.settings.totalShares) * 100).toFixed(1)}%`, inline: true }
            )
            .setTimestamp();
          
          await channel.send({ embeds: [embed] });
        }
      }
    }

    return result;
  }

  async sellShares(userId: string, serverId: string, amount: number): Promise<boolean> {
    const server = await database.getServer(serverId);
    if (!server) return false;

    // Sell at 80% of current price (20% loss to prevent easy arbitrage)
    const sellPrice = Math.floor(server.settings.sharePrice * 0.8);
    const result = await database.sellShares(userId, serverId, amount, sellPrice);
    
    if (result) {
      logger.info(`User ${userId} sold ${amount} shares in server ${serverId} for ${amount * sellPrice} tokens`);
    }

    return result;
  }

  async getTopShareholders(serverId: string, limit: number = 10): Promise<Array<{
    userId: string;
    shares: number;
    percentage: number;
    totalDividendsEarned: number;
  }>> {
    const shareholders = await database.getServerShareholders(serverId);
    const server = await database.getServer(serverId);
    if (!server) return [];

    return shareholders
      .slice(0, limit)
      .map(holder => ({
        userId: holder.userId,
        shares: holder.shares,
        percentage: (holder.shares / server.settings.totalShares) * 100,
        totalDividendsEarned: holder.totalDividendsEarned
      }));
  }

  async getDividendHistory(serverId: string, limit: number = 10): Promise<any[]> {
    // For now, return empty array until we add a public method to database
    // In a future update, we would add database.getDividendPayouts(serverId, limit)
    return [];
  }

  async estimateROI(serverId: string, shares: number): Promise<{
    dailyEstimate: number;
    weeklyEstimate: number;
    monthlyEstimate: number;
    breakEvenDays: number;
  }> {
    const server = await database.getServer(serverId);
    if (!server) {
      throw new Error('Server not found');
    }

    // Get recent spending activity
    const recentTransactions = await database.getServerTransactions(serverId, 1000);
    const spendTransactions = recentTransactions.filter(t => t.type === 'spend' && t.timestamp > Date.now() / 1000 - 30 * 24 * 60 * 60);
    
    const totalSpentLast30Days = spendTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const dailyAverage = totalSpentLast30Days / 30;

    const sharePercentage = shares / server.settings.totalShares;
    const dailyDividend = dailyAverage * (server.settings.dividendPercentage / 100) * sharePercentage;

    const investmentCost = shares * server.settings.sharePrice;
    const breakEvenDays = Math.ceil(investmentCost / dailyDividend);

    return {
      dailyEstimate: Math.floor(dailyDividend),
      weeklyEstimate: Math.floor(dailyDividend * 7),
      monthlyEstimate: Math.floor(dailyDividend * 30),
      breakEvenDays
    };
  }
} 