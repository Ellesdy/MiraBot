import { Events, VoiceState } from 'discord.js';
import { MiraClient } from '../client';
import { logger } from '../../utils/logger';
import { Event } from './eventHandler';

const voiceStateUpdate: Event = {
  name: Events.VoiceStateUpdate,
  async execute(oldState: VoiceState, newState: VoiceState) {
    const client = newState.client as MiraClient;

    try {
      // Pass voice state changes to the voice activity manager
      await client.voiceActivityManager.handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      logger.error('Error handling voice state update:', error);
    }
  },
};

export default voiceStateUpdate; 