import { MiraClient } from '../client';
import { logger } from '../../utils/logger';
import fs from 'fs';
import path from 'path';

export interface Event {
  name: string;
  once?: boolean;
  execute: (...args: any[]) => Promise<void>;
}

export class EventHandler {
  private client: MiraClient;

  constructor(client: MiraClient) {
    this.client = client;
  }

  public async loadEvents(): Promise<void> {
    try {
      const eventsPath = path.join(__dirname, '.');
      const eventFiles = fs.readdirSync(eventsPath).filter(file => {
        // Filter out TypeScript declaration files
        if (file.endsWith('.d.ts')) return false;
        
        // Filter out map files
        if (file.endsWith('.map')) return false;
        
        // Filter out the event handler itself
        if (file.includes('eventHandler')) return false;
        
        // In production (dist folder), only load .js files
        // In development (src folder), only load .ts files
        const isDist = __dirname.includes('dist');
        if (isDist) {
          return file.endsWith('.js');
        } else {
          return file.endsWith('.ts');
        }
      });

      for (const file of eventFiles) {
        try {
          const filePath = path.join(eventsPath, file);
          const eventModule = await import(filePath);
          const event: Event = eventModule.default || eventModule;

          if (event.once) {
            this.client.once(event.name, (...args) => event.execute(...args));
          } else {
            this.client.on(event.name, (...args) => event.execute(...args));
          }

          logger.debug(`Loaded event: ${event.name}`);
        } catch (error) {
          logger.error(`Error loading event ${file}:`, error);
        }
      }

      logger.info(`Loaded events from ${eventFiles.length} files`);
    } catch (error) {
      logger.error('Error loading events:', error);
    }
  }
} 