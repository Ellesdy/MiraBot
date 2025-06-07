import { 
  GuildMember, 
  User,
  TextChannel,
  VoiceChannel,
  EmbedBuilder,
  PermissionFlagsBits,
  GuildMemberRoleManager
} from 'discord.js';
import { MiraClient } from '../client';
import { database } from '../../database/database';
import { logger } from '../../utils/logger';
import { DEFAULT_ACTIONS, Action } from '../../database/models';

export interface ActionResult {
  success: boolean;
  message: string;
  cost?: number;
}

export class ActionManager {
  private client: MiraClient;
  private actions: Map<string, Action> = new Map();

  constructor(client: MiraClient) {
    this.client = client;
    this.loadActions();
  }

  private loadActions(): void {
    DEFAULT_ACTIONS.forEach(action => {
      this.actions.set(action.id, action);
    });
  }

  public getAction(actionId: string): Action | undefined {
    return this.actions.get(actionId);
  }

  public getAvailableActions(serverId: string): Action[] {
    // Filter based on server settings
    return Array.from(this.actions.values()).filter(action => action.enabled);
  }

  public async canPerformAction(
    userId: string, 
    targetUserId: string, 
    actionId: string, 
    serverId: string
  ): Promise<{ canPerform: boolean; reason?: string }> {
    const action = this.getAction(actionId);
    if (!action) {
      return { canPerform: false, reason: 'Action not found' };
    }

    const server = await database.getServer(serverId);
    if (!server || !server.settings.enabledActions.includes(actionId)) {
      return { canPerform: false, reason: 'Action not enabled on this server' };
    }

    // Check if user is blacklisted
    if (server.settings.blacklistedUsers.includes(userId)) {
      return { canPerform: false, reason: 'You are blacklisted from using actions' };
    }

    // Check cooldown
    const cooldown = await database.getCooldown(userId, serverId, actionId);
    if (cooldown) {
      const timeLeft = cooldown.expiresAt - Math.floor(Date.now() / 1000);
      return { 
        canPerform: false, 
        reason: `Action on cooldown for ${Math.ceil(timeLeft / 60)} more minutes` 
      };
    }

    // Check if target is protected (server owner, admins, etc.)
    const guild = this.client.guilds.cache.get(serverId);
    if (!guild) {
      return { canPerform: false, reason: 'Server not found' };
    }

    const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
    if (!targetMember) {
      return { canPerform: false, reason: 'Target user not found' };
    }

    const userMember = await guild.members.fetch(userId).catch(() => null);
    if (!userMember) {
      return { canPerform: false, reason: 'User not found' };
    }

    // Can't target yourself
    if (userId === targetUserId) {
      return { canPerform: false, reason: 'Cannot target yourself' };
    }

    // Can't target server owner
    if (targetUserId === guild.ownerId) {
      return { canPerform: false, reason: 'Cannot target server owner' };
    }

    // Can't target bot owners
    if (this.client.isOwner(targetUserId)) {
      return { canPerform: false, reason: 'Cannot target bot owner' };
    }

    // Role hierarchy check removed - users can target anyone as long as bot has permission
    // The bot still needs to be higher than the target for the action to work

    // Check bot permissions for the action
    const botMember = guild.members.me;
    if (!botMember) {
      return { canPerform: false, reason: 'Bot not found in server' };
    }

    if (!this.hasRequiredPermissions(botMember, action)) {
      return { canPerform: false, reason: 'Bot lacks required permissions' };
    }

    // Check if bot is higher than target (only hierarchy check needed)
    if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
      return { canPerform: false, reason: 'Bot cannot perform actions on users with equal or higher roles' };
    }

    return { canPerform: true };
  }

  private hasRequiredPermissions(botMember: GuildMember, action: Action): boolean {
    for (const permission of action.permissions) {
      if (!botMember.permissions.has(permission as keyof typeof PermissionFlagsBits)) {
        return false;
      }
    }
    return true;
  }

  public async performAction(
    userId: string,
    targetUserId: string,
    actionId: string,
    serverId: string,
    parameters?: any
  ): Promise<ActionResult> {
    try {
      const canPerform = await this.canPerformAction(userId, targetUserId, actionId, serverId);
      if (!canPerform.canPerform) {
        return { success: false, message: canPerform.reason || 'Cannot perform action' };
      }

      const action = this.getAction(actionId)!;
      const server = await database.getServer(serverId);
      const cost = server?.settings.actionPrices[actionId] || action.defaultPrice;

      // Check if user can afford the action (unless it's the bot punishing someone)
      const isBotPunishment = userId === this.client.user?.id;
      if (!isBotPunishment) {
        const canAfford = await this.client.tokenManager.canAfford(userId, cost);
        if (!canAfford) {
          return { 
            success: false, 
            message: `Insufficient tokens. This action costs ${cost} tokens.`,
            cost 
          };
        }
      }

      // Perform the specific action
      const result = await this.executeAction(userId, targetUserId, actionId, serverId, parameters);
      
      if (result.success) {
        // Deduct tokens (unless it's the bot punishing someone)
        if (!isBotPunishment) {
          await this.client.tokenManager.spendTokens(userId, cost, actionId, serverId, targetUserId);
        }
        
        // Set cooldown (even for bot actions to prevent spam)
        const cooldownDuration = server?.settings.cooldowns[actionId] || action.cooldown;
        await database.setCooldown(userId, serverId, actionId, cooldownDuration);
        
        // Track action usage for adaptive economy
        await database.trackActionUsage(serverId, actionId);
        
        // Log the action
        await this.logAction(userId, targetUserId, actionId, serverId, isBotPunishment ? 0 : cost);
      }

      return { ...result, cost };
    } catch (error) {
      logger.error('Error performing action:', error);
      return { success: false, message: 'An error occurred while performing the action' };
    }
  }

  private async executeAction(
    userId: string,
    targetUserId: string,
    actionId: string,
    serverId: string,
    parameters?: any
  ): Promise<ActionResult> {
    const guild = this.client.guilds.cache.get(serverId);
    if (!guild) {
      return { success: false, message: 'Server not found' };
    }

    const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
    if (!targetMember) {
      return { success: false, message: 'Target user not found' };
    }

    switch (actionId) {
      case 'nickname_change':
        return await this.performNicknameChange(targetMember, parameters?.nickname);
      
      case 'timeout_5min':
        return await this.performTimeout(targetMember, 5 * 60 * 1000, '5 minutes');
      
      case 'timeout_1hour':
        return await this.performTimeout(targetMember, 60 * 60 * 1000, '1 hour');
      
      case 'timeout_1day':
        return await this.performTimeout(targetMember, 24 * 60 * 60 * 1000, '1 day');
      
      case 'voice_disconnect':
        return await this.performVoiceDisconnect(targetMember);
      
      case 'send_dm':
        return await this.performSendDM(targetMember, parameters?.message, userId);
      
      case 'role_add_temp':
        return await this.performTempRole(targetMember, parameters?.roleId, 60 * 60 * 1000);
      
      default:
        return { success: false, message: 'Unknown action' };
    }
  }

  private async performNicknameChange(member: GuildMember, newNickname: string): Promise<ActionResult> {
    try {
      if (!newNickname || newNickname.length > 32) {
        return { success: false, message: 'Invalid nickname (must be 1-32 characters)' };
      }

      const oldNickname = member.displayName;
      await member.setNickname(newNickname, 'MiraPay: Nickname change action');
      
      return { 
        success: true, 
        message: `Successfully changed nickname from "${oldNickname}" to "${newNickname}"` 
      };
    } catch (error) {
      return { success: false, message: 'Failed to change nickname' };
    }
  }

  private async performTimeout(member: GuildMember, duration: number, durationText: string): Promise<ActionResult> {
    try {
      await member.timeout(duration, 'MiraPay: Timeout action');
      return { 
        success: true, 
        message: `Successfully timed out ${member.displayName} for ${durationText}` 
      };
    } catch (error) {
      return { success: false, message: 'Failed to timeout user' };
    }
  }

  private async performVoiceDisconnect(member: GuildMember): Promise<ActionResult> {
    try {
      if (!member.voice.channel) {
        return { success: false, message: 'User is not in a voice channel' };
      }

      await member.voice.disconnect('MiraPay: Voice disconnect action');
      return { 
        success: true, 
        message: `Successfully disconnected ${member.displayName} from voice` 
      };
    } catch (error) {
      return { success: false, message: 'Failed to disconnect user from voice' };
    }
  }

  private async performSendDM(member: GuildMember, message: string, senderId: string): Promise<ActionResult> {
    try {
      if (!message || message.length > 500) {
        return { success: false, message: 'Invalid message (must be 1-500 characters)' };
      }

      const sender = await this.client.users.fetch(senderId);
      const embed = new EmbedBuilder()
        .setTitle('MiraPay Message')
        .setDescription(message)
        .setFooter({ text: `Sent by ${sender.username} via MiraPay` })
        .setColor(0x00ff00)
        .setTimestamp();

      await member.send({ embeds: [embed] });
      
      return { 
        success: true, 
        message: `Successfully sent DM to ${member.displayName}` 
      };
    } catch (error) {
      return { success: false, message: 'Failed to send DM (user may have DMs disabled)' };
    }
  }

  private async performTempRole(member: GuildMember, roleId: string, duration: number): Promise<ActionResult> {
    try {
      if (!roleId) {
        return { success: false, message: 'No role specified' };
      }

      const role = member.guild.roles.cache.get(roleId);
      if (!role) {
        return { success: false, message: 'Role not found' };
      }

      if (role.position >= member.guild.members.me!.roles.highest.position) {
        return { success: false, message: 'Role is too high for bot to assign' };
      }

      await member.roles.add(role, 'MiraPay: Temporary role action');
      
      // Schedule role removal
      setTimeout(async () => {
        try {
          await member.roles.remove(role, 'MiraPay: Temporary role expired');
        } catch (error) {
          logger.error('Failed to remove temporary role:', error);
        }
      }, duration);

      return { 
        success: true, 
        message: `Successfully gave ${member.displayName} the ${role.name} role for 1 hour` 
      };
    } catch (error) {
      return { success: false, message: 'Failed to add temporary role' };
    }
  }

  private async logAction(
    userId: string,
    targetUserId: string,
    actionId: string,
    serverId: string,
    cost: number
  ): Promise<void> {
    try {
      const server = await database.getServer(serverId);
      if (!server?.settings.moderationLogChannel) return;

      const logChannel = this.client.channels.cache.get(server.settings.moderationLogChannel) as TextChannel;
      if (!logChannel) return;

      const guild = this.client.guilds.cache.get(serverId);
      if (!guild) return;

      const user = await this.client.users.fetch(userId);
      const targetUser = await this.client.users.fetch(targetUserId);
      const action = this.getAction(actionId);

      // Get member objects for roles/nicknames
      const member = await guild.members.fetch(userId).catch(() => null);
      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

      // Determine action color and emoji based on category
      let color = 0xff9900;
      let emoji = '⚡';
      if (action) {
        switch (action.category) {
          case 'moderation':
            color = 0xff0000;
            emoji = '🔨';
            break;
          case 'fun':
            color = 0x00ff00;
            emoji = '🎉';
            break;
          case 'utility':
            color = 0x0099ff;
            emoji = '🔧';
            break;
        }
      }

      // Special formatting for bot punishment
      const isBotPunishment = userId === this.client.user?.id;
      if (isBotPunishment) {
        color = 0x800080; // Purple for bot actions
        emoji = '🤖';
      }

      const embed = new EmbedBuilder()
        .setTitle(`${emoji} Action Log: ${action?.name || actionId}`)
        .setColor(color)
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp()
        .setFooter({ 
          text: `Action ID: ${actionId} • Server: ${guild.name}`,
          iconURL: guild.iconURL() || undefined
        });

      // Add fields based on whether it's a bot punishment or user action
      if (isBotPunishment) {
        embed.addFields(
          { 
            name: '🤖 Performer', 
            value: `**Robotic Policeman**\n*Punishment Mode*`, 
            inline: true 
          },
          { 
            name: '🎯 Target', 
            value: `${targetUser}\n${targetMember?.displayName || targetUser.username}\n\`${targetUser.id}\``, 
            inline: true 
          },
          { 
            name: '💰 Cost', 
            value: `**FREE**\n*Bot Punishment*`, 
            inline: true 
          }
        );
        embed.setDescription('*The Robotic Policeman has administered justice without payment.*');
      } else {
        embed.addFields(
          { 
            name: '👤 Performer', 
            value: `${user}\n${member?.displayName || user.username}\n\`${user.id}\``, 
            inline: true 
          },
          { 
            name: '🎯 Target', 
            value: `${targetUser}\n${targetMember?.displayName || targetUser.username}\n\`${targetUser.id}\``, 
            inline: true 
          },
          { 
            name: '💰 Cost', 
            value: `**${cost}** tokens`, 
            inline: true 
          }
        );
      }

      // Add action-specific details
      if (action) {
        embed.addFields(
          { 
            name: '📋 Action Details', 
            value: `**Category:** ${action.category}\n**Description:** ${action.description}`, 
            inline: false 
          }
        );
      }

      // Add timestamp in multiple formats for clarity
      embed.addFields(
        { 
          name: '🕒 Time', 
          value: `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`, 
          inline: false 
        }
      );

      await logChannel.send({ embeds: [embed] });
    } catch (error) {
      logger.error('Failed to log action:', error);
    }
  }
}