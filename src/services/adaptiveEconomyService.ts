import { database } from '../database/database';
import { logger } from '../utils/logger';
import { Server, Action, DEFAULT_ACTIONS } from '../database/models';

export class AdaptiveEconomyService {
  /**
   * Update prices for all actions in a server based on usage patterns
   */
  async updatePricesForServer(serverId: string): Promise<void> {
    try {
      const server = await database.getServer(serverId);
      if (!server || !server.settings.adaptiveEconomy.enabled) {
        return;
      }

      const settings = server.settings.adaptiveEconomy;
      const usageStats = await database.getActionUsageStats(serverId);
      const avgUsage = await database.getAverageActionUsage(serverId);

      logger.info(`Updating prices for server ${serverId}. Average hourly usage: ${avgUsage}`);

      for (const stats of usageStats) {
        const action = DEFAULT_ACTIONS.find(a => a.id === stats.actionId);
        if (!action) continue;

        // Check if enough time has passed since last update
        const now = Math.floor(Date.now() / 1000);
        const hoursSinceUpdate = (now - stats.lastPriceUpdate) / 3600;
        
        if (hoursSinceUpdate < settings.updateInterval) {
          continue;
        }

        // Calculate usage ratio compared to average
        const usageRatio = avgUsage > 0 ? (stats.hourlyUsage / avgUsage) * 100 : 50;
        const currentPrice = server.settings.actionPrices[stats.actionId] || action.defaultPrice;
        
        let newPrice = currentPrice;
        let reason = '';
        let changePercentage = 0;

        // Determine if price should change based on usage patterns
        if (usageRatio >= settings.priceIncreaseThreshold) {
          // High demand - increase price
          const increaseMultiplier = 1 + (settings.priceChangeRate / 100) * settings.volatilityFactor;
          newPrice = Math.floor(currentPrice * increaseMultiplier);
          reason = 'high_demand';
          changePercentage = ((newPrice - currentPrice) / currentPrice) * 100;
        } else if (usageRatio <= settings.priceDecreaseThreshold) {
          // Low demand - decrease price
          const decreaseMultiplier = 1 - (settings.priceChangeRate / 100) * settings.volatilityFactor;
          newPrice = Math.floor(currentPrice * decreaseMultiplier);
          reason = 'low_demand';
          changePercentage = ((newPrice - currentPrice) / currentPrice) * 100;
        }

        // Apply price limits
        const maxPrice = Math.floor(action.defaultPrice * settings.maxPriceMultiplier);
        const minPrice = Math.floor(action.defaultPrice * settings.minPriceMultiplier);
        newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));

        // Only update if price actually changed
        if (newPrice !== currentPrice) {
          await database.updateActionPrice(serverId, stats.actionId, newPrice, reason, changePercentage);
          
          logger.info(
            `Price updated for ${action.name} in server ${serverId}: ` +
            `${currentPrice} → ${newPrice} tokens (${changePercentage.toFixed(1)}% ${reason === 'high_demand' ? 'increase' : 'decrease'}). ` +
            `Usage ratio: ${usageRatio.toFixed(1)}%`
          );
        }
      }
    } catch (error) {
      logger.error(`Error updating prices for server ${serverId}:`, error);
    }
  }

  /**
   * Update prices for all servers with adaptive economy enabled
   */
  async updateAllServerPrices(): Promise<void> {
    try {
      // Get all servers with adaptive economy enabled
      const servers = await database.getAllServersWithAdaptiveEconomy();
      
      logger.info(`Running adaptive economy update for ${servers.length} servers`);
      
      for (const server of servers) {
        await this.updatePricesForServer(server.id);
      }
      
      // Clean up old price history (keep last 30 days)
      await database.cleanOldPriceHistory(30);
      
    } catch (error) {
      logger.error('Error in adaptive economy update:', error);
    }
  }

  /**
   * Get market trends for a specific action or all actions
   */
  async getMarketTrends(serverId: string, actionId?: string): Promise<any> {
    const priceHistory = await database.getPriceHistory(serverId, actionId, 100);
    const usageStats = await database.getActionUsageStats(serverId, actionId);
    
    // Calculate trends
    const trends: { [key: string]: any } = {};
    
    if (actionId) {
      trends[actionId] = this.calculateTrend(priceHistory, usageStats);
    } else {
      // Get trends for all actions
      for (const stats of usageStats) {
        const actionHistory = priceHistory.filter(h => h.actionId === stats.actionId);
        trends[stats.actionId] = this.calculateTrend(actionHistory, stats);
      }
    }
    
    return trends;
  }

  private calculateTrend(priceHistory: any[], usageStats: any): any {
    if (priceHistory.length === 0) {
      return {
        currentPrice: 0,
        priceChange24h: 0,
        priceChange7d: 0,
        volatility: 0,
        demand: 'stable',
        hourlyUsage: usageStats?.hourlyUsage || 0,
        dailyUsage: usageStats?.dailyUsage || 0
      };
    }

    const currentPrice = priceHistory[0]?.price || 0;
    const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 86400);
    
    const price24hAgo = priceHistory.find(h => h.timestamp <= oneDayAgo)?.price || currentPrice;
    const price7dAgo = priceHistory.find(h => h.timestamp <= sevenDaysAgo)?.price || currentPrice;
    
    const priceChange24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;
    const priceChange7d = ((currentPrice - price7dAgo) / price7dAgo) * 100;
    
    // Calculate volatility (standard deviation of price changes)
    const priceChanges = [];
    for (let i = 1; i < Math.min(priceHistory.length, 10); i++) {
      const change = Math.abs(priceHistory[i-1].changePercentage);
      priceChanges.push(change);
    }
    
    const volatility = priceChanges.length > 0 
      ? Math.sqrt(priceChanges.reduce((sum, c) => sum + c * c, 0) / priceChanges.length)
      : 0;
    
    // Determine demand level
    let demand = 'stable';
    if (priceChange24h > 10) demand = 'high';
    else if (priceChange24h < -10) demand = 'low';
    
    return {
      currentPrice,
      priceChange24h,
      priceChange7d,
      volatility,
      demand,
      hourlyUsage: usageStats?.hourlyUsage || 0,
      dailyUsage: usageStats?.dailyUsage || 0,
      priceHistory: priceHistory.slice(0, 20) // Last 20 price changes
    };
  }

  /**
   * Reset action prices to defaults for a server
   */
  async resetPrices(serverId: string): Promise<void> {
    const server = await database.getServer(serverId);
    if (!server) return;

    const defaultPrices = DEFAULT_ACTIONS.reduce((acc, action) => {
      acc[action.id] = action.defaultPrice;
      return acc;
    }, {} as { [action: string]: number });

    await database.updateServerSettings(serverId, { actionPrices: defaultPrices });
    
    // Record the reset in price history
    for (const action of DEFAULT_ACTIONS) {
      const currentPrice = server.settings.actionPrices[action.id] || action.defaultPrice;
      const changePercentage = ((action.defaultPrice - currentPrice) / currentPrice) * 100;
      
      await database.updateActionPrice(
        serverId, 
        action.id, 
        action.defaultPrice, 
        'reset', 
        changePercentage
      );
    }
    
    logger.info(`Reset all action prices to defaults for server ${serverId}`);
  }
}

export const adaptiveEconomyService = new AdaptiveEconomyService(); 