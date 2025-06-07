import { MiraClient } from '../client';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';

interface RateLimit {
  count: number;
  resetTime: number;
}

export class SecurityManager {
  private client: MiraClient;
  private rateLimits: Map<string, RateLimit> = new Map();

  constructor(client: MiraClient) {
    this.client = client;
    this.setupCleanupInterval();
  }

  private setupCleanupInterval(): void {
    // Clean up expired rate limits every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, rateLimit] of this.rateLimits.entries()) {
        if (now > rateLimit.resetTime) {
          this.rateLimits.delete(key);
        }
      }
    }, 60000);
  }

  public isRateLimited(userId: string, action: string = 'global'): boolean {
    const key = `${userId}:${action}`;
    const rateLimit = this.rateLimits.get(key);
    
    if (!rateLimit) {
      return false;
    }

    const now = Date.now();
    if (now > rateLimit.resetTime) {
      this.rateLimits.delete(key);
      return false;
    }

    return rateLimit.count >= config.security.rateLimitMax;
  }

  public addRateLimit(userId: string, action: string = 'global'): void {
    const key = `${userId}:${action}`;
    const now = Date.now();
    const resetTime = now + config.security.rateLimitWindow;
    
    const existing = this.rateLimits.get(key);
    if (existing && now <= existing.resetTime) {
      existing.count++;
    } else {
      this.rateLimits.set(key, { count: 1, resetTime });
    }
  }

  public getRemainingCooldown(userId: string, action: string = 'global'): number {
    const key = `${userId}:${action}`;
    const rateLimit = this.rateLimits.get(key);
    
    if (!rateLimit) {
      return 0;
    }

    const now = Date.now();
    if (now > rateLimit.resetTime) {
      this.rateLimits.delete(key);
      return 0;
    }

    return Math.max(0, rateLimit.resetTime - now);
  }

  public async validateUser(userId: string, guildId?: string): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    try {
      // Check if user is bot owner (always valid)
      if (this.client.isOwner(userId)) {
        return { valid: true };
      }

      // Check global rate limit
      if (this.isRateLimited(userId)) {
        const remaining = this.getRemainingCooldown(userId);
        return { 
          valid: false, 
          reason: `Rate limited. Try again in ${Math.ceil(remaining / 1000)} seconds.` 
        };
      }

      // Check if user exists and is accessible
      const user = await this.client.users.fetch(userId).catch(() => null);
      if (!user) {
        return { valid: false, reason: 'User not found' };
      }

      // Check guild-specific validations
      if (guildId) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {
          return { valid: false, reason: 'Guild not found' };
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          return { valid: false, reason: 'User not found in this server' };
        }

        // Check if user is banned or has restrictions
        // This could be extended to check custom server blacklists
      }

      return { valid: true };
    } catch (error) {
      logger.error('Error validating user:', error);
      return { valid: false, reason: 'Validation error' };
    }
  }

  public async validateGuild(guildId: string): Promise<{
    valid: boolean;
    reason?: string;
  }> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return { valid: false, reason: 'Guild not found' };
      }

      // Check if guild is accessible
      if (!guild.available) {
        return { valid: false, reason: 'Guild is unavailable' };
      }

      // Check bot permissions
      const botMember = guild.members.me;
      if (!botMember) {
        return { valid: false, reason: 'Bot not found in guild' };
      }

      // Verify essential permissions
      const requiredPermissions = [
        'ViewChannels',
        'SendMessages',
        'EmbedLinks',
        'ReadMessageHistory'
      ];

      for (const permission of requiredPermissions) {
        if (!botMember.permissions.has(permission as any)) {
          return { 
            valid: false, 
            reason: `Bot missing required permission: ${permission}` 
          };
        }
      }

      return { valid: true };
    } catch (error) {
      logger.error('Error validating guild:', error);
      return { valid: false, reason: 'Guild validation error' };
    }
  }

  public sanitizeInput(input: string, maxLength: number = 100): string {
    if (!input) return '';
    
    // Remove potential markdown exploits and trim
    return input
      .replace(/[`*_~|\\]/g, '') // Remove markdown characters
      .replace(/@(everyone|here)/gi, '@\u200b$1') // Break @everyone/@here
      .replace(/<@[!&]?\d+>/g, '[mention]') // Replace mentions
      .trim()
      .substring(0, maxLength);
  }

  public isValidSnowflake(id: string): boolean {
    return /^\d{17,19}$/.test(id);
  }

  public async checkBotPermissions(guildId: string, permissions: string[]): Promise<{
    hasAll: boolean;
    missing: string[];
  }> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        return { hasAll: false, missing: permissions };
      }

      const botMember = guild.members.me;
      if (!botMember) {
        return { hasAll: false, missing: permissions };
      }

      const missing: string[] = [];
      for (const permission of permissions) {
        if (!botMember.permissions.has(permission as any)) {
          missing.push(permission);
        }
      }

      return { hasAll: missing.length === 0, missing };
    } catch (error) {
      logger.error('Error checking bot permissions:', error);
      return { hasAll: false, missing: permissions };
    }
  }

  public logSecurityEvent(
    event: string, 
    userId: string, 
    guildId?: string, 
    details?: any
  ): void {
    logger.warn('Security Event', {
      event,
      userId,
      guildId,
      details,
      timestamp: new Date().toISOString()
    });
  }

  public async isUserBlacklisted(userId: string, guildId?: string): Promise<boolean> {
    try {
      // Check global blacklist (could be implemented as a config file or database)
      const globalBlacklist = process.env.GLOBAL_BLACKLIST?.split(',') || [];
      if (globalBlacklist.includes(userId)) {
        return true;
      }

      // Check guild-specific blacklist
      if (guildId) {
        const { database } = await import('../../database/database');
        const server = await database.getServer(guildId);
        if (server?.settings.blacklistedUsers.includes(userId)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking blacklist:', error);
      return false; // Fail open for blacklist checks
    }
  }

  public async validateActionSecurity(
    userId: string,
    targetUserId: string,
    actionId: string,
    guildId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Basic user validation
      const userValidation = await this.validateUser(userId, guildId);
      if (!userValidation.valid) {
        return userValidation;
      }

      // Check if user is blacklisted
      if (await this.isUserBlacklisted(userId, guildId)) {
        this.logSecurityEvent('blacklisted_user_attempt', userId, guildId, { actionId, targetUserId });
        return { valid: false, reason: 'User is blacklisted' };
      }

      // Action-specific rate limiting
      if (this.isRateLimited(userId, actionId)) {
        const remaining = this.getRemainingCooldown(userId, actionId);
        return { 
          valid: false, 
          reason: `Action rate limited. Try again in ${Math.ceil(remaining / 1000)} seconds.` 
        };
      }

      // Target validation
      const targetValidation = await this.validateUser(targetUserId, guildId);
      if (!targetValidation.valid) {
        return { valid: false, reason: `Target user: ${targetValidation.reason}` };
      }

      // Check if target is blacklisted (protect blacklisted users from actions)
      if (await this.isUserBlacklisted(targetUserId)) {
        return { valid: false, reason: 'Cannot target this user' };
      }

      return { valid: true };
    } catch (error) {
      logger.error('Error validating action security:', error);
      return { valid: false, reason: 'Security validation error' };
    }
  }

  public recordAction(userId: string, actionId: string): void {
    // Add rate limit for the specific action
    this.addRateLimit(userId, actionId);
    
    // Add to global rate limit
    this.addRateLimit(userId, 'global');
  }
} 