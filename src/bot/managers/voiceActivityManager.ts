import { VoiceState, GuildMember } from 'discord.js';
import { MiraClient } from '../client';
import { database } from '../../database/database';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';

interface VoiceSession {
  userId: string;
  guildId: string;
  joinTime: number;
  lastRewardTime: number;
  channelId: string;
}

export class VoiceActivityManager {
  private client: MiraClient;
  private activeSessions: Map<string, VoiceSession> = new Map();
  private rewardInterval?: NodeJS.Timeout;

  constructor(client: MiraClient) {
    this.client = client;
    this.startRewardInterval();
  }

  private startRewardInterval(): void {
    // Award tokens every minute for active voice users
    this.rewardInterval = setInterval(() => {
      this.processRewards();
    }, 60000); // 60 seconds
  }

  private async processRewards(): Promise<void> {
    const now = Date.now();
    
    for (const [sessionKey, session] of this.activeSessions.entries()) {
      const timeSinceLastReward = now - session.lastRewardTime;
      
      // Award tokens per minute (60000ms)
      if (timeSinceLastReward >= 60000) {
        try {
          // Check if user is still in voice channel
          const guild = this.client.guilds.cache.get(session.guildId);
          if (!guild) continue;

          const member = await guild.members.fetch(session.userId).catch(() => null);
          if (!member || !member.voice.channel) {
            // User left, clean up session
            this.activeSessions.delete(sessionKey);
            continue;
          }

          // Get server settings for tokens per minute
          const serverSettings = await database.getServer(session.guildId);
          const tokensToAward = serverSettings?.settings.voiceTokensPerMinute || 1;

          await this.client.tokenManager.addTokens(
            session.userId,
            tokensToAward,
            'Voice activity reward',
            session.guildId
          );

          // Update last reward time
          session.lastRewardTime = now;

          logger.debug(`Awarded ${tokensToAward} tokens to ${session.userId} for voice activity`);
        } catch (error) {
          logger.error('Error processing voice activity reward:', error);
        }
      }
    }
  }

  public async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const userId = newState.id;
    const guildId = newState.guild.id;
    const sessionKey = `${userId}:${guildId}`;

    // User joined a voice channel
    if (!oldState.channel && newState.channel) {
      await this.startVoiceSession(userId, guildId, newState.channel.id);
    }
    // User left a voice channel
    else if (oldState.channel && !newState.channel) {
      await this.endVoiceSession(sessionKey);
    }
    // User switched channels
    else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      await this.updateVoiceSession(sessionKey, newState.channel.id);
    }
  }

  private async startVoiceSession(userId: string, guildId: string, channelId: string): Promise<void> {
    const now = Date.now();
    const sessionKey = `${userId}:${guildId}`;

    // Check if user should receive rewards (not in AFK channel, not alone, etc.)
    if (!await this.shouldTrackUser(userId, guildId, channelId)) {
      return;
    }

    const session: VoiceSession = {
      userId,
      guildId,
      joinTime: now,
      lastRewardTime: now,
      channelId
    };

    this.activeSessions.set(sessionKey, session);
    
    logger.info(`Started voice tracking for user ${userId} in guild ${guildId}`);
  }

  private async endVoiceSession(sessionKey: string): Promise<void> {
    const session = this.activeSessions.get(sessionKey);
    if (!session) return;

    const now = Date.now();
    const totalTime = now - session.joinTime;
    const minutes = Math.floor(totalTime / 60000);

    this.activeSessions.delete(sessionKey);

    logger.info(`Ended voice session for ${session.userId}: ${minutes} minutes total`);
  }

  private async updateVoiceSession(sessionKey: string, newChannelId: string): Promise<void> {
    const session = this.activeSessions.get(sessionKey);
    if (!session) return;

    // Check if new channel should be tracked
    if (!await this.shouldTrackUser(session.userId, session.guildId, newChannelId)) {
      // Stop tracking if moved to non-trackable channel
      this.activeSessions.delete(sessionKey);
      return;
    }

    session.channelId = newChannelId;
    logger.debug(`User ${session.userId} switched to channel ${newChannelId}`);
  }

  private async shouldTrackUser(userId: string, guildId: string, channelId: string): Promise<boolean> {
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return false;

      const channel = guild.channels.cache.get(channelId);
      if (!channel || !channel.isVoiceBased()) return false;

      // Don't track AFK channel
      if (guild.afkChannelId === channelId) return false;

      // Check server settings for voice activity rewards
      const serverSettings = await database.getServer(guildId);
      if (!serverSettings?.settings.voiceActivityRewards) return false;

      // Check if channel is excluded
      if (serverSettings.settings.excludedVoiceChannels.includes(channelId)) return false;

      // Check if user is blacklisted
      if (await this.client.securityManager.isUserBlacklisted(userId, guildId)) return false;

      // Check if user is alone in channel (optional setting)
      if (serverSettings.settings.requireOthersInVoice) {
        const voiceChannel = channel as any;
        if (voiceChannel.members.size <= 1) return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking if user should be tracked:', error);
      return false;
    }
  }

  public async getUserVoiceStats(userId: string, guildId: string): Promise<{
    isActive: boolean;
    currentSessionMinutes: number;
    todayMinutes: number;
  }> {
    const sessionKey = `${userId}:${guildId}`;
    const session = this.activeSessions.get(sessionKey);
    
    let currentSessionMinutes = 0;
    if (session) {
      currentSessionMinutes = Math.floor((Date.now() - session.joinTime) / 60000);
    }

    // Get today's voice activity from transactions
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const transactions = await database.getUserTransactions(userId, 1000);
    const todayVoiceRewards = transactions.filter(tx => 
      tx.description === 'Voice activity reward' &&
      tx.timestamp * 1000 >= todayStart.getTime()
    );

    const todayMinutes = todayVoiceRewards.reduce((total, tx) => total + tx.amount, 0);

    return {
      isActive: !!session,
      currentSessionMinutes,
      todayMinutes
    };
  }

  public getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  public cleanup(): void {
    if (this.rewardInterval) {
      clearInterval(this.rewardInterval);
    }
    this.activeSessions.clear();
  }
} 