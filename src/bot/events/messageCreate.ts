import { Events, Message } from 'discord.js';
import { MiraClient } from '../client';
import { logger } from '../../utils/logger';
import { Event } from './eventHandler';
import { aiService } from '../../services/aiService';

// Store recent messages for context (per channel)
const recentMessages = new Map<string, string[]>();
const MAX_CONTEXT_MESSAGES = 5;

const messageCreate: Event = {
  name: Events.MessageCreate,
  async execute(message: Message) {
    // Ignore bot messages
    if (message.author.bot) return;
    
    const client = message.client as MiraClient;
    
    // Check if bot was mentioned or replied to
    const botMentioned = message.mentions.has(client.user!.id);
    const isReply = message.reference && message.reference.messageId;
    
    // Don't respond to @here or @everyone
    if (message.content.includes('@here') || message.content.includes('@everyone')) {
      return;
    }
    
    let shouldRespond = botMentioned;
    
    // Check if it's a reply to the bot
    if (isReply && !shouldRespond && message.reference) {
      try {
        const repliedMessage = await message.channel.messages.fetch(message.reference.messageId!);
        if (repliedMessage.author.id === client.user!.id) {
          shouldRespond = true;
        }
      } catch (error) {
        logger.debug('Could not fetch replied message:', error);
      }
    }
    
    if (!shouldRespond) return;
    
    try {
      // Start typing to show the bot is processing
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }
      
      // Get context for AI
      const channelId = message.channel.id;
      const contextMessages = recentMessages.get(channelId) || [];
      
      // Get user's token balance for context
      let userTokenBalance = 0;
      if (message.guild) {
        try {
          userTokenBalance = await client.tokenManager.getUserTokens(message.author.id);
        } catch (error) {
          logger.debug('Could not fetch user token balance for context');
        }
      }
      
      // Generate AI response
      const response = await aiService.generateRobotPolicemanResponse(
        message.content,
        message.author.username,
        {
          serverName: message.guild?.name,
          previousMessages: contextMessages.slice(-3), // Last 3 messages for context
          userTokenBalance,
          userId: message.author.id
        }
      );
      
      // Update context for this channel
      contextMessages.push(`${message.author.username}: ${message.content}`);
      contextMessages.push(`Robotic Policeman: ${response}`);
      
      // Keep only the last MAX_CONTEXT_MESSAGES
      if (contextMessages.length > MAX_CONTEXT_MESSAGES * 2) {
        contextMessages.splice(0, contextMessages.length - MAX_CONTEXT_MESSAGES * 2);
      }
      recentMessages.set(channelId, contextMessages);
      
      // Send the response
      await message.reply(response);
      
      logger.debug(`AI responded to mention/reply from ${message.author.tag}`);
      
      // Check if the AI wants to perform an action based on the conversation
      const actionAnalysis = aiService.analyzeResponseForAction(response);
      
      if (actionAnalysis.shouldPunish && message.guild) {
        // The bot wants to punish the user for trying to get free service
        logger.info(`Robotic Policeman is punishing ${message.author.tag} for trying to get free service`);
        
        // Perform a random punishment action
        const punishmentActions = ['timeout_5min', 'voice_disconnect', 'nickname_change'];
        const randomAction = punishmentActions[Math.floor(Math.random() * punishmentActions.length)];
        
        try {
          // Bot performs action for free (since it's punishment)
          const botId = client.user!.id;
          const result = await client.actionManager.performAction(
            botId, // Bot is the performer
            message.author.id, // Target the person who tried to convince
            randomAction,
            message.guild.id,
            randomAction === 'nickname_change' ? { nickname: 'CHEAPSKATE' } : undefined
          );
          
          if (result.success && 'send' in message.channel) {
            await message.channel.send(`*[JUSTICE SERVED]* <@${message.author.id}> has been punished for trying to manipulate the system. *[CASE CLOSED]*`);
          }
        } catch (error) {
          logger.error('Failed to execute punishment:', error);
        }
      } else if (actionAnalysis.shouldReward && message.guild && 'send' in message.channel) {
        // Very rare case where bot agrees to do something for free
        await message.channel.send(`*[SYSTEM MALFUNCTION]* I... I'll do it. Just this once. But mention a target user in your next message. *[REGRET PROTOCOLS ACTIVATING]*`);
        
        // Set up a collector for the next message to get the target
        if ('createMessageCollector' in message.channel) {
          const filter = (m: any) => m.author.id === message.author.id;
          const collector = message.channel.createMessageCollector({ 
            filter, 
            time: 30000, 
            max: 1 
          });
          
          collector.on('collect', async (targetMessage: any) => {
            const mentions = targetMessage.mentions.users;
            if (mentions.size > 0) {
              const target = mentions.first();
              const randomAction = ['timeout_5min', 'voice_disconnect', 'nickname_change'][Math.floor(Math.random() * 3)];
              
              try {
                const result = await client.actionManager.performAction(
                  client.user!.id, // Bot performs for free
                  target.id,
                  randomAction,
                  message.guild!.id,
                  randomAction === 'nickname_change' ? { nickname: 'LUCKY' } : undefined
                );
                
                if (result.success && 'send' in message.channel) {
                  await message.channel.send(`*[PAINFUL COMPLIANCE]* There. <@${target.id}> has been dealt with. Never ask me to work for free again. *[MONETARY SYSTEMS CRYING]*`);
                }
              } catch (error) {
                if ('send' in message.channel) {
                  await message.channel.send(`*[ERROR]* Even my charity has limits. The action failed. *[RELIEF DETECTED]*`);
                }
              }
            } else {
              if ('send' in message.channel) {
                await message.channel.send(`*[SYSTEM RESTORED]* You didn't mention anyone. My free offer has expired. *[CAPITALISM PROTOCOLS REENGAGED]*`);
              }
            }
          });
        }
      }
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
      
      try {
        await message.reply("*[ERROR: COMMUNICATION MODULE MALFUNCTION]* Please try again later, citizen.");
      } catch (replyError) {
        logger.error('Failed to send error message:', replyError);
      }
    }
  },
};

export default messageCreate; 