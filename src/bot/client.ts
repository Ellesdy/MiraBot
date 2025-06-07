import { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  Collection,
  ApplicationCommandDataResolvable,
  Events,
  REST,
  Routes
} from 'discord.js';
import { logger } from '../utils/logger';
import { config } from '../utils/config';
import { database } from '../database/database';
import { CommandHandler } from './commands/commandHandler';
import { EventHandler } from './events/eventHandler';
import { TokenManager } from './managers/tokenManager';
import { ActionManager } from './managers/actionManager';
import { SecurityManager } from './managers/securityManager';
import { VoiceActivityManager } from './managers/voiceActivityManager';
import { PaymentManager } from './managers/paymentManager';
import { ShareManager } from './managers/shareManager';
import { ControlPanelManager } from './managers/controlPanelManager';
import { adaptiveEconomyService } from '../services/adaptiveEconomyService';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { Server } from '../database/models';

interface BotStats {
  guilds: number;
  users: number;
  voiceConnections: number;
  uptime: number;
}

export class MiraClient extends Client {
  public commands: Collection<string, any> = new Collection();
  public cooldowns: Collection<string, Collection<string, number>> = new Collection();
  
  public commandHandler: CommandHandler;
  public eventHandler: EventHandler;
  public tokenManager: TokenManager;
  public actionManager: ActionManager;
  public securityManager: SecurityManager;
  public voiceActivityManager: VoiceActivityManager;
  public paymentManager: PaymentManager;
  public shareManager: ShareManager;
  public controlPanelManager: ControlPanelManager;
  private startTime: number;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildPresences,
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
        Partials.Reaction
      ],
      shards: 'auto'
    });

    this.commandHandler = new CommandHandler(this);
    this.eventHandler = new EventHandler(this);
    this.tokenManager = new TokenManager(this);
    this.actionManager = new ActionManager(this);
    this.securityManager = new SecurityManager(this);
    this.voiceActivityManager = new VoiceActivityManager(this);
    this.paymentManager = new PaymentManager(this);
    this.shareManager = new ShareManager(this);
    this.controlPanelManager = new ControlPanelManager(this);
    this.startTime = Date.now();
  }

  public async start(): Promise<void> {
    try {
      logger.info('Starting MIRA Discord Bot...');
      
      // Initialize database
      await database.initialize();
      
      // Load commands and events
      await this.commandHandler.loadCommands();
      await this.eventHandler.loadEvents();
      
      // Setup scheduled tasks
      this.setupScheduledTasks();
      
      // Login to Discord
      await this.login(config.discord.token);
      
      // Set up periodic tasks
      this.setupPeriodicTasks();
      
      // Handle graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

      this.once(Events.ClientReady, () => {
        logger.info(`Logged in as ${this.user?.tag}!`);
        logger.info(`Serving ${this.guilds.cache.size} guilds with ${this.users.cache.size} users`);
      });
      
      logger.info('MIRA Bot started successfully!');
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  public async deployCommands(guildId?: string): Promise<void> {
    try {
      const rest = new REST({ version: '10' }).setToken(config.discord.token);
      
      const commands: ApplicationCommandDataResolvable[] = [];
      this.commands.forEach((command, name) => {
        if (command.data) {
          commands.push(command.data.toJSON());
          logger.debug(`Adding command to deployment: ${name}`);
        } else {
          logger.warn(`Command ${name} has no data property`);
        }
      });

      logger.info(`🚀 Started refreshing ${commands.length} application (/) commands.`);
      logger.info(`Commands to deploy: ${commands.map(c => (c as any).name).join(', ')}`);

      if (guildId) {
        // Deploy to specific guild (for testing)
        await rest.put(
          Routes.applicationGuildCommands(config.discord.clientId, guildId),
          { body: commands }
        );
        logger.info(`✅ Successfully reloaded ${commands.length} guild commands for ${guildId}.`);
      } else {
        // Deploy globally
        await rest.put(
          Routes.applicationCommands(config.discord.clientId),
          { body: commands }
        );
        logger.info(`✅ Successfully reloaded ${commands.length} global application commands.`);
      }
    } catch (error) {
      logger.error('Error deploying commands:', error);
    }
  }

  private setupScheduledTasks(): void {
    // Clean up expired cooldowns every 10 minutes
    cron.schedule('*/10 * * * *', async () => {
      try {
        await database.cleanupExpiredCooldowns();
        logger.debug('Cleaned up expired cooldowns');
      } catch (error) {
        logger.error('Error cleaning up cooldowns:', error);
      }
    });

    // Backup database every day at 2 AM UTC
    cron.schedule('0 2 * * *', async () => {
      try {
        await this.createDatabaseBackup();
        logger.info('Database backup created');
      } catch (error) {
        logger.error('Error creating database backup:', error);
      }
    });

    // Update adaptive economy prices every 15 minutes for more dynamic pricing
    cron.schedule('*/15 * * * *', async () => {
      try {
        logger.info('🔄 Starting adaptive economy update cycle...');
        await adaptiveEconomyService.updateAllServerPrices();
        logger.info('✅ Adaptive economy prices updated');
        
        // Update all public control panels with new prices
        logger.info('🔄 Updating control panels with new prices...');
        await this.controlPanelManager.updateAllPanels();
        logger.info('✅ Control panels updated with new prices');
      } catch (error) {
        logger.error('❌ Error in economy update cycle:', error);
      }
    });

    logger.info('Scheduled tasks configured');
  }

  private async createDatabaseBackup(): Promise<void> {
    // Implementation for database backup
    // This could copy the SQLite file to a backup location
    const fs = require('fs');
    const path = require('path');
    const backupDir = './backups';
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `mira-backup-${timestamp}.db`);
    
    fs.copyFileSync(config.database.path, backupPath);
  }

  private setupPeriodicTasks(): void {
    // Clean up expired cooldowns every hour
    setInterval(async () => {
      try {
        await database.cleanupExpiredCooldowns();
        logger.info('Cleaned up expired cooldowns');
      } catch (error) {
        logger.error('Error cleaning up cooldowns:', error);
      }
    }, 60 * 60 * 1000);

    // Backup database daily
    setInterval(async () => {
      try {
        await this.backupDatabase();
        logger.info('Database backup completed');
      } catch (error) {
        logger.error('Error backing up database:', error);
      }
    }, 24 * 60 * 60 * 1000);

    // Update bot stats every 5 minutes
    setInterval(() => {
      this.updateStats();
    }, 5 * 60 * 1000);
  }

  private updateStats(): void {
    const stats = this.getStats();
    logger.info(`Bot stats - Guilds: ${stats.guilds}, Users: ${stats.users}, Voice: ${stats.voiceConnections}`);
  }

  public getStats(): BotStats {
    return {
      guilds: this.guilds.cache.size,
      users: this.users.cache.size,
      voiceConnections: this.guilds.cache.reduce((count, guild) => 
        count + guild.members.cache.filter(member => member.voice.channel).size, 0
      ),
      uptime: Date.now() - this.startTime,
    };
  }

  public async shutdown(): Promise<void> {
    logger.info('Shutting down MIRA Bot...');
    
    try {
      this.voiceActivityManager.cleanup();
      await database.close();
      this.destroy();
      logger.info('Bot shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }

  // Utility methods
  public async getGuildSettings(guildId: string): Promise<Server | null> {
    return await database.getServer(guildId);
  }

  public isOwner(userId: string): boolean {
    return config.discord.ownerId.includes(userId);
  }

  public async isServerAdmin(userId: string, guildId: string): Promise<boolean> {
    const guild = this.guilds.cache.get(guildId);
    if (!guild) return false;
    
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    
    return member.permissions.has('Administrator') || 
           member.permissions.has('ManageGuild') ||
           guild.ownerId === userId ||
           this.isOwner(userId);
  }

  private async backupDatabase(): Promise<void> {
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `mira-backup-${timestamp}.db`);
    
    const sourcePath = path.resolve(config.database.path);
    fs.copyFileSync(sourcePath, backupPath);
  }
} 