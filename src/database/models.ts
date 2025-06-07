export interface User {
  id: string; // Discord user ID
  tokens: number;
  totalEarned: number;
  totalSpent: number;
  lastDaily: number; // Timestamp - LEGACY: No longer used with voice-based earning
  createdAt: number;
  updatedAt: number;
}

export interface Server {
  id: string; // Discord server ID
  name: string;
  ownerId: string;
  prefix: string;
  isActive: boolean;
  settings: ServerSettings;
  createdAt: number;
  updatedAt: number;
}

export interface ServerSettings {
  tokenRewards: boolean;
  dailyTokens: number; // LEGACY: No longer used with voice-based earning
  maxTokensPerUser: number;
  enabledActions: string[];
  actionPrices: { [action: string]: number };
  moderationLogChannel?: string;
  announcementChannel?: string;
  requiredRoles: string[];
  blacklistedUsers: string[];
  cooldowns: { [action: string]: number };
  voiceActivityRewards: boolean;
  voiceTokensPerMinute: number;
  requireOthersInVoice: boolean;
  excludedVoiceChannels: string[];
  sharesEnabled: boolean;
  totalShares: number;
  sharePrice: number;
  dividendPercentage: number;
  minSharesToBuy: number;
  maxSharesPerUser: number;
  shareHolderBenefits: string[];
  adaptiveEconomy: AdaptiveEconomySettings;
}

export interface Transaction {
  id: number;
  userId: string;
  serverId: string;
  type: 'earn' | 'spend' | 'admin_add' | 'admin_remove';
  amount: number;
  action?: string;
  targetUserId?: string;
  description: string;
  timestamp: number;
}

export interface Action {
  id: string;
  name: string;
  description: string;
  defaultPrice: number;
  category: 'moderation' | 'fun' | 'utility';
  permissions: string[];
  cooldown: number; // in milliseconds
  enabled: boolean;
}

export interface UserCooldown {
  userId: string;
  serverId: string;
  action: string;
  expiresAt: number;
}

export interface DashboardUser {
  id: number;
  discordId: string;
  username: string;
  discriminator: string;
  avatar?: string;
  accessToken: string;
  refreshToken: string;
  permissions: string[];
  createdAt: number;
  lastLogin: number;
}

export interface ServerShare {
  id: number;
  serverId: string;
  userId: string;
  shares: number;
  purchasePrice: number; // Price per share when bought
  purchasedAt: number;
  totalDividendsEarned: number;
}

export interface ShareTransaction {
  id: number;
  serverId: string;
  userId: string;
  type: 'buy' | 'sell' | 'dividend';
  shares: number;
  pricePerShare: number;
  totalAmount: number;
  timestamp: number;
}

export interface ServerShareSettings {
  sharesEnabled: boolean;
  totalShares: number; // Total shares available for the server
  sharePrice: number; // Current price per share
  dividendPercentage: number; // Percentage of spent tokens distributed to shareholders
  minSharesToBuy: number;
  maxSharesPerUser: number;
  shareHolderBenefits: string[]; // Additional perks for shareholders
}

export interface DividendPayout {
  id: number;
  serverId: string;
  totalAmount: number; // Total tokens distributed
  perShareAmount: number; // Tokens per share
  shareholderCount: number;
  timestamp: number;
}

// Adaptive Economy Models
export interface ActionUsageStats {
  serverId: string;
  actionId: string;
  hourlyUsage: number; // Usage in the last hour
  dailyUsage: number; // Usage in the last 24 hours
  weeklyUsage: number; // Usage in the last 7 days
  lastUsed: number; // Timestamp of last use
  totalUsage: number; // All-time usage count
  lastPriceUpdate: number; // When the price was last adjusted
}

export interface PriceHistory {
  id: number;
  serverId: string;
  actionId: string;
  price: number;
  reason: 'high_demand' | 'low_demand' | 'manual' | 'reset';
  changePercentage: number; // Percentage change from previous price
  usageAtTime: number; // Usage count when price changed
  timestamp: number;
}

export interface AdaptiveEconomySettings {
  enabled: boolean; // Whether adaptive pricing is enabled
  updateInterval: number; // How often to update prices (in hours)
  priceIncreaseThreshold: number; // Usage percentage to trigger price increase
  priceDecreaseThreshold: number; // Usage percentage to trigger price decrease
  maxPriceMultiplier: number; // Maximum price can be X times the default
  minPriceMultiplier: number; // Minimum price can be X times the default
  priceChangeRate: number; // Percentage to change price by (e.g., 10 = ±10%)
  volatilityFactor: number; // How reactive prices are to demand (0.1 to 2.0)
}

export const DEFAULT_ACTIONS: Action[] = [
  {
    id: 'nickname_change',
    name: 'Change Nickname',
    description: 'Change another user\'s nickname',
    defaultPrice: 50, // Increased from 5
    category: 'fun',
    permissions: ['MANAGE_NICKNAMES'],
    cooldown: 300000, // 5 minutes
    enabled: true
  },
  {
    id: 'timeout_5min',
    name: 'Timeout (5 minutes)',
    description: 'Timeout a user for 5 minutes',
    defaultPrice: 1000, // Increased from 200
    category: 'moderation',
    permissions: ['MODERATE_MEMBERS'],
    cooldown: 1800000, // 30 minutes
    enabled: true
  },
  {
    id: 'timeout_1hour',
    name: 'Timeout (1 hour)',
    description: 'Timeout a user for 1 hour',
    defaultPrice: 5000, // Increased from 500
    category: 'moderation',
    permissions: ['MODERATE_MEMBERS'],
    cooldown: 3600000, // 1 hour
    enabled: true
  },
  {
    id: 'timeout_1day',
    name: 'Timeout (1 day)',
    description: 'Timeout a user for 1 day',
    defaultPrice: 20000, // Increased from 1000
    category: 'moderation',
    permissions: ['MODERATE_MEMBERS'],
    cooldown: 86400000, // 24 hours
    enabled: true
  },
  {
    id: 'voice_disconnect',
    name: 'Voice Disconnect',
    description: 'Disconnect a user from voice channel',
    defaultPrice: 500, // Increased from 50
    category: 'moderation',
    permissions: ['MOVE_MEMBERS'],
    cooldown: 600000, // 10 minutes
    enabled: true
  },
  {
    id: 'send_dm',
    name: 'Send DM',
    description: 'Send a direct message to a user',
    defaultPrice: 100, // Increased from 10
    category: 'fun',
    permissions: [],
    cooldown: 300000, // 5 minutes
    enabled: true
  },
  {
    id: 'role_add_temp',
    name: 'Temporary Role',
    description: 'Give a user a temporary role for 1 hour',
    defaultPrice: 1000, // Increased from 100
    category: 'fun',
    permissions: ['MANAGE_ROLES'],
    cooldown: 3600000, // 1 hour
    enabled: true
  }
]; 