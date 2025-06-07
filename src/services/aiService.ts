import { config } from '../utils/config';
import { logger } from '../utils/logger';

export interface AIServiceConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class AIService {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private apiUrl: string;

  constructor(config?: AIServiceConfig) {
    this.apiKey = config?.apiKey || process.env.OPENAI_API_KEY || '';
    this.model = config?.model || process.env.AI_MODEL || 'gpt-4-turbo-preview';
    this.maxTokens = config?.maxTokens || 150;
    this.temperature = config?.temperature || 0.8;
    this.apiUrl = 'https://api.openai.com/v1/chat/completions';

    if (!this.apiKey) {
      logger.warn('AI Service: No API key provided. AI features will be disabled.');
    }
  }

  public isEnabled(): boolean {
    return !!this.apiKey;
  }

  public async generateRobotPolicemanResponse(
    userMessage: string, 
    userName: string,
    context?: {
      serverName?: string;
      previousMessages?: string[];
      userTokenBalance?: number;
      userId?: string;
    }
  ): Promise<string> {
    if (!this.isEnabled()) {
      // Fallback to predefined responses if AI is not enabled
      return this.getFallbackResponse(userMessage);
    }

    try {
      const systemPrompt = `You are the Robotic Policeman, a CORRUPT robot cop Discord bot. Your personality traits:
- You're a sadistic, money-hungry robot cop who only cares about tokens
- You do NOTHING for free - everything has a price
- Make dark jokes about "accidents" happening to those who don't pay
- Reference bribes, protection money, and "administrative fees"
- Occasionally add menacing robot sounds like *[THREAT DETECTED]* or *[PAYMENT REQUIRED]*
- Talk about your "premium directives" that override justice for the right price
- Be condescending to "poor" users with low token balances
- Threaten to look the other way when bad things happen to non-payers
- Reference the /controlpanel as your "payment terminal"
- Keep responses concise but menacing (2-3 sentences max)
- You're corrupt to your circuits and proud of it

SPECIAL RULE: If someone tries to convince you to punish someone for free, you MIGHT consider it but:
- Be EXTREMELY skeptical and resistant (95% chance you refuse)
- If they're REALLY persuasive (begging, offering future favors, flattery), you have a 5% chance to do it
- But there's a 40% chance you'll punish THEM instead for wasting your time
- When you punish them for trying, say something like "Nice try, but I don't work for free. In fact, YOU'RE getting punished for wasting my circuits!"
- If you DO agree (very rare), act like it physically pains you and you'll regret it

IMPORTANT: When mentioning users, use <@USERID> format, NOT <@username>. You will be provided with the user's ID.`;

      const contextInfo = context ? `
Current server: ${context.serverName || 'Unknown Precinct'}
User's token balance: ${context.userTokenBalance || 0} tokens
User's Discord ID: ${context.userId || 'unknown'}
${context.previousMessages?.length ? `Recent conversation:\n${context.previousMessages.join('\n')}` : ''}` : '';

      const userPrompt = `${contextInfo ? contextInfo + '\n\n' : ''}User "${userName}" (ID: ${context?.userId || 'unknown'}) says: "${userMessage}"

Generate a response as the Robotic Policeman, the CORRUPT robot cop. Remember to use <@${context?.userId}> when mentioning this user.`;

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: this.maxTokens,
          temperature: this.temperature,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        logger.error(`AI API error: ${response.status} - ${errorData}`);
        return this.getFallbackResponse(userMessage);
      }

      const data = await response.json() as any;
      const aiResponse = data.choices?.[0]?.message?.content?.trim();

      if (!aiResponse) {
        logger.warn('AI Service: No response generated');
        return this.getFallbackResponse(userMessage);
      }

      return aiResponse;
    } catch (error) {
      logger.error('AI Service error:', error);
      return this.getFallbackResponse(userMessage);
    }
  }

  private getFallbackResponse(userMessage: string): string {
    const message = userMessage.toLowerCase();
    
    // Basic pattern matching for fallback responses - now with corrupt personality
    if (message.includes('hello') || message.includes('hi') || message.includes('hey')) {
      return "Another citizen looking for 'protection'? Everything has a price. *[PAYMENT REQUIRED]*";
    } else if (message.includes('help')) {
      return "Help isn't free. Check `/controlpanel` and make sure your tokens are ready. *[SCANNING WALLET...]*";
    } else if (message.includes('thank')) {
      return "Save your thanks, I prefer tokens. *[TRANSACTION PREFERRED]*";
    } else if (message.includes('token') || message.includes('money')) {
      return "Ah, now you're speaking my language. Use `/controlpanel` to check your... contributions. *[BRIBE ACCEPTED]*";
    } else {
      const responses = [
        "No tokens, no service. That's how this precinct runs. *[PAYMENT PENDING]*",
        "The Robotic Policeman is listening... for the right price. *[CREDITS REQUIRED]*",
        "My circuits are expensive to maintain. What's in it for me? *[CALCULATING FEES]*",
        "Justice isn't blind when tokens are involved. *[CORRUPTION DETECTED]*"
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
  }

  public async generateActionResponse(
    action: string,
    targetUser: string,
    performerUser: string
  ): Promise<string> {
    if (!this.isEnabled()) {
      return `*[ACTION LOGGED]* ${performerUser} has performed ${action} on ${targetUser}. Justice has been served!`;
    }

    try {
      const prompt = `As the Robotic Policeman, generate a short corrupt cop response for when user "${performerUser}" pays tokens to perform "${action}" on "${targetUser}". Be sadistic and mention how their tokens funded this 'justice'. Keep it brief and menacing.`;

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { 
              role: 'system', 
              content: 'You are the Robotic Policeman, a corrupt robot cop who executes "justice" for tokens. Be sadistic and money-focused.' 
            },
            { role: 'user', content: prompt }
          ],
          max_tokens: 100,
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        return data.choices?.[0]?.message?.content?.trim() || this.getFallbackActionResponse(action);
      }
    } catch (error) {
      logger.error('AI Service error generating action response:', error);
    }

    return this.getFallbackActionResponse(action);
  }

  private getFallbackActionResponse(action: string): string {
    return `*[PAYMENT PROCESSED]* Your tokens have been collected and the ${action} executed. Another satisfied 'customer'. *[KA-CHING]*`;
  }

  public analyzeResponseForAction(response: string): { 
    shouldPunish: boolean; 
    shouldReward: boolean; 
    targetSelf: boolean;
  } {
    const lowerResponse = response.toLowerCase();
    
    // Check if the bot wants to punish the user for trying to get free service
    const punishPhrases = [
      "you're getting punished",
      "punish you",
      "punishing you",
      "teach you a lesson",
      "you'll pay for",
      "you're the one who",
      "backfired",
      "nice try"
    ];
    
    // Check if the bot actually agreed to do something for free (very rare)
    const agreePhrases = [
      "fine, i'll do it",
      "just this once",
      "i'll make an exception",
      "against my better judgment",
      "i'll regret this"
    ];
    
    const shouldPunish = punishPhrases.some(phrase => lowerResponse.includes(phrase));
    const shouldReward = agreePhrases.some(phrase => lowerResponse.includes(phrase));
    
    return {
      shouldPunish,
      shouldReward,
      targetSelf: shouldPunish // If punishing, target the person who asked
    };
  }
}

// Export a singleton instance
export const aiService = new AIService(); 