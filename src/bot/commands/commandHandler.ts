import { 
  Collection, 
  SlashCommandBuilder, 
  CommandInteraction, 
  AutocompleteInteraction,
  PermissionsBitField 
} from 'discord.js';
import { MiraClient } from '../client';
import { logger } from '../../utils/logger';
import fs from 'fs';
import path from 'path';

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: CommandInteraction, client: MiraClient) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, client: MiraClient) => Promise<void>;
  permissions?: bigint[];
  ownerOnly?: boolean;
  guildOnly?: boolean;
  cooldown?: number;
}

export class CommandHandler {
  private client: MiraClient;
  public commands: Collection<string, Command> = new Collection();

  constructor(client: MiraClient) {
    this.client = client;
  }

  public async loadCommands(): Promise<void> {
    try {
      const commandsPath = path.join(__dirname, '.');
      const commandFiles = fs.readdirSync(commandsPath).filter(file => {
        // Filter out TypeScript declaration files
        if (file.endsWith('.d.ts')) return false;
        
        // Filter out map files
        if (file.endsWith('.map')) return false;
        
        // Filter out the command handler itself
        if (file.includes('commandHandler')) return false;
        
        // In production (dist folder), only load .js files
        // In development (src folder), only load .ts files
        const isDist = __dirname.includes('dist');
        if (isDist) {
          return file.endsWith('.js');
        } else {
          return file.endsWith('.ts');
        }
      });

      for (const file of commandFiles) {
        try {
          const filePath = path.join(commandsPath, file);
          logger.debug(`Attempting to load command from file: ${file} at path: ${filePath}`);
          
          const commandModule = await import(filePath);
          const command: Command = commandModule.default || commandModule;

          if ('data' in command && 'execute' in command) {
            this.commands.set(command.data.name, command);
            this.client.commands.set(command.data.name, command);
            logger.info(`✅ Successfully loaded command: ${command.data.name} from ${file}`);
          } else {
            logger.warn(`⚠️ Command ${file} is missing required properties. Has data: ${'data' in command}, Has execute: ${'execute' in command}`);
          }
        } catch (error) {
          logger.error(`❌ Error loading command ${file}:`, error);
        }
      }

      logger.info(`Loaded ${this.commands.size} commands`);
    } catch (error) {
      logger.error('Error loading commands:', error);
    }
  }

  public async handleCommand(interaction: CommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);
    
    if (!command) {
      logger.warn(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      // Security checks
      const securityCheck = await this.performSecurityChecks(interaction, command);
      if (!securityCheck.allowed) {
        try {
          await interaction.reply({ 
            content: securityCheck.reason, 
            ephemeral: true 
          });
        } catch (error: any) {
          if (error.code === 10062) {
            logger.debug('Interaction expired before security check response');
          } else if (error.code === 40060) {
            logger.debug('Interaction already acknowledged');
          } else {
            logger.error('Error sending security check response:', error);
          }
        }
        return;
      }

      // Cooldown check
      const cooldownCheck = this.checkCooldown(interaction, command);
      if (!cooldownCheck.allowed) {
        try {
          await interaction.reply({ 
            content: cooldownCheck.reason, 
            ephemeral: true 
          });
        } catch (error: any) {
          if (error.code === 10062) {
            logger.debug('Interaction expired before cooldown response');
          } else if (error.code === 40060) {
            logger.debug('Interaction already acknowledged');
          } else {
            logger.error('Error sending cooldown response:', error);
          }
        }
        return;
      }

      // Execute command
      await command.execute(interaction, this.client);
      
      // Set cooldown
      this.setCooldown(interaction, command);

      logger.info(`Command executed: ${command.data.name} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error('Error executing command:', error);
      
      const errorMessage = 'There was an error while executing this command!';
      
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (followUpError) {
        logger.error('Error sending error message:', followUpError);
      }
    }
  }

  public async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);
    
    if (!command || !command.autocomplete) {
      return;
    }

    try {
      await command.autocomplete(interaction, this.client);
    } catch (error) {
      logger.error('Error handling autocomplete:', error);
    }
  }

  private async performSecurityChecks(
    interaction: CommandInteraction, 
    command: Command
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Owner only check
    if (command.ownerOnly && !this.client.isOwner(interaction.user.id)) {
      return { allowed: false, reason: 'This command is restricted to bot owners.' };
    }

    // Guild only check
    if (command.guildOnly && !interaction.guild) {
      return { allowed: false, reason: 'This command can only be used in a server.' };
    }

    // Permission checks
    if (command.permissions && interaction.guild) {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const hasPermissions = command.permissions.every(permission => 
        member.permissions.has(permission)
      );
      
      if (!hasPermissions) {
        return { 
          allowed: false, 
          reason: 'You do not have the required permissions to use this command.' 
        };
      }
    }

    // Rate limiting check
    const security = await this.client.securityManager.validateUser(
      interaction.user.id, 
      interaction.guild?.id
    );
    
    if (!security.valid) {
      return { allowed: false, reason: security.reason };
    }

    // Blacklist check
    if (interaction.guild) {
      const isBlacklisted = await this.client.securityManager.isUserBlacklisted(
        interaction.user.id, 
        interaction.guild.id
      );
      
      if (isBlacklisted) {
        this.client.securityManager.logSecurityEvent(
          'blacklisted_command_attempt',
          interaction.user.id,
          interaction.guild.id,
          { command: command.data.name }
        );
        return { allowed: false, reason: 'You are blacklisted from using commands.' };
      }
    }

    return { allowed: true };
  }

  private checkCooldown(
    interaction: CommandInteraction, 
    command: Command
  ): { allowed: boolean; reason?: string } {
    if (!command.cooldown) {
      return { allowed: true };
    }

    const userId = interaction.user.id;
    const commandName = command.data.name;
    
    if (!this.client.cooldowns.has(commandName)) {
      this.client.cooldowns.set(commandName, new Collection());
    }

    const now = Date.now();
    const timestamps = this.client.cooldowns.get(commandName)!;
    const cooldownAmount = command.cooldown * 1000;

    if (timestamps.has(userId)) {
      const expirationTime = timestamps.get(userId)! + cooldownAmount;

      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        return { 
          allowed: false, 
          reason: `Please wait ${timeLeft.toFixed(1)} more seconds before reusing the \`${commandName}\` command.` 
        };
      }
    }

    return { allowed: true };
  }

  private setCooldown(interaction: CommandInteraction, command: Command): void {
    if (!command.cooldown) return;

    const userId = interaction.user.id;
    const commandName = command.data.name;
    const now = Date.now();

    if (!this.client.cooldowns.has(commandName)) {
      this.client.cooldowns.set(commandName, new Collection());
    }

    const timestamps = this.client.cooldowns.get(commandName)!;
    timestamps.set(userId, now);

    // Clean up expired cooldowns
    setTimeout(() => timestamps.delete(userId), command.cooldown! * 1000);
  }

  public getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  public getAllCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  public getCommandsByCategory(category: string): Command[] {
    // This could be implemented if commands had categories
    return this.getAllCommands();
  }
} 