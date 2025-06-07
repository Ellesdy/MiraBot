import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  discord: {
    token: string;
    clientId: string;
    clientSecret: string;
    shardCount: number | 'auto';
    ownerId: string[];
  };
  database: {
    path: string;
  };
  dashboard: {
    port: number;
    url: string;
    jwtSecret: string;
    sessionSecret: string;
  };
  bot: {
    defaultPrefix: string;
    dailyTokenReward: number;
    maxTokensPerUser: number;
    tokenDecayEnabled: boolean;
    tokenDecayRate: number;
  };
  security: {
    rateLimitWindow: number;
    rateLimitMax: number;
    bcryptRounds: number;
  };
  logging: {
    level: string;
    file: string;
  };
}

function parseShardCount(value: string | undefined): number | 'auto' {
  if (!value || value === 'auto') return 'auto';
  const parsed = parseInt(value);
  return isNaN(parsed) ? 'auto' : parsed;
}

function parseOwnerIds(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map(id => id.trim()).filter(id => id.length > 0);
}

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function optionalEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function optionalEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function optionalEnvFloat(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config: Config = {
  discord: {
    token: requiredEnv('DISCORD_TOKEN'),
    clientId: requiredEnv('DISCORD_CLIENT_ID'),
    clientSecret: requiredEnv('DISCORD_CLIENT_SECRET'),
    shardCount: parseShardCount(process.env.SHARD_COUNT),
    ownerId: parseOwnerIds(process.env.OWNER_IDS),
  },
  database: {
    path: optionalEnv('DATABASE_PATH', './data/mirapay.db'),
  },
  dashboard: {
    port: optionalEnvNumber('DASHBOARD_PORT', 3000),
    url: optionalEnv('DASHBOARD_URL', 'http://localhost:3000'),
    jwtSecret: requiredEnv('JWT_SECRET'),
    sessionSecret: requiredEnv('SESSION_SECRET'),
  },
  bot: {
    defaultPrefix: optionalEnv('DEFAULT_PREFIX', '!'),
    dailyTokenReward: optionalEnvNumber('DAILY_TOKEN_REWARD', 100),
    maxTokensPerUser: optionalEnvNumber('MAX_TOKENS_PER_USER', 10000),
    tokenDecayEnabled: optionalEnvBoolean('TOKEN_DECAY_ENABLED', false),
    tokenDecayRate: optionalEnvFloat('TOKEN_DECAY_RATE', 0.01),
  },
  security: {
    rateLimitWindow: optionalEnvNumber('RATE_LIMIT_WINDOW', 60000),
    rateLimitMax: optionalEnvNumber('RATE_LIMIT_MAX', 10),
    bcryptRounds: optionalEnvNumber('BCRYPT_ROUNDS', 12),
  },
  logging: {
    level: optionalEnv('LOG_LEVEL', 'info'),
    file: optionalEnv('LOG_FILE', './logs/bot.log'),
  },
};

export default config; 