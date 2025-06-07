import { Router, Request, Response } from 'express';
import { config } from '../../utils/config';
import { logger } from '../../utils/logger';
import crypto from 'crypto';

const authRouter = Router();

// Discord OAuth URLs
const DISCORD_API_URL = 'https://discord.com/api/v10';
const OAUTH_REDIRECT_URI = `${config.dashboard.url}/auth/callback`;

// Discord API types
interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot?: boolean;
  system?: boolean;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

// Login route - redirects to Discord OAuth
authRouter.get('/login', (req: Request, res: Response) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.state = state;
  
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds',
    state: state
  });
  
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// OAuth callback
authRouter.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query;
  
  if (!code || !state || state !== req.session.state) {
    return res.redirect('/auth/error?message=Invalid state');
  }
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: OAUTH_REDIRECT_URI
      })
    });
    
    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for tokens');
    }
    
    const tokens = await tokenResponse.json() as DiscordTokenResponse;
    
    // Get user info
    const userResponse = await fetch(`${DISCORD_API_URL}/users/@me`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });
    
    if (!userResponse.ok) {
      throw new Error('Failed to fetch user info');
    }
    
    const user = await userResponse.json() as DiscordUser;
    
    // Get user guilds
    const guildsResponse = await fetch(`${DISCORD_API_URL}/users/@me/guilds`, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`
      }
    });
    
    const guilds = guildsResponse.ok ? await guildsResponse.json() as DiscordGuild[] : [];
    
    // Store user info in session
    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar || undefined,
      guilds: guilds
    };
    
    logger.info(`User ${user.username}#${user.discriminator} logged in`);
    
    // Redirect to dashboard or original page
    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);
    
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.redirect('/auth/error?message=Authentication failed');
  }
});

// Logout route
authRouter.get('/logout', (req: Request, res: Response) => {
  const username = req.session.user?.username;
  req.session.destroy((err) => {
    if (err) {
      logger.error('Logout error:', err);
    } else if (username) {
      logger.info(`User ${username} logged out`);
    }
    res.redirect('/');
  });
});

// Error page
authRouter.get('/error', (req: Request, res: Response) => {
  const message = req.query.message || 'An error occurred during authentication';
  res.render('error', { message });
});

// Middleware to check if user is authenticated
export function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }
  next();
}

// Session extension for TypeScript
declare module 'express-session' {
  interface SessionData {
    state?: string;
    returnTo?: string;
  }
}

export { authRouter }; 