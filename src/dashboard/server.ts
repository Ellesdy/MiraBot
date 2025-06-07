import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { database } from '../database/database';
import path from 'path';
import { authRouter } from './routes/auth';
import { apiRouter } from './routes/api';
import { paymentRouter } from './routes/payment';
import { dashboardRouter } from './routes/dashboard';
import session from 'express-session';

const app = express();
const port = config.dashboard.port;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:", "https://cdn.discordapp.com"],
      connectSrc: ["'self'", "https://discord.com", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://checkout.stripe.com"],
    },
  },
}));
app.use(cors({
  origin: config.dashboard.url,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: config.dashboard.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Static files
// app.use(express.static(path.join(__dirname, 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', '..', 'src', 'dashboard', 'views'));

// Routes
app.use('/auth', authRouter);
app.use('/api', apiRouter);
app.use('/payment', paymentRouter);
app.use('/dashboard', dashboardRouter);

// Home page
app.get('/', (req: Request, res: Response) => {
  res.render('index', { 
    user: req.session.user,
    botName: 'MIRA'
  });
});

// Purchase page
app.get('/purchase', (req: Request, res: Response) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  
  res.render('purchase', {
    user: req.session.user,
    packages: [
      {
        id: 'starter',
        name: 'Starter Pack',
        tokens: 100,
        price: 1.99,
        description: '100 tokens for basic actions'
      },
      {
        id: 'popular',
        name: 'Popular Pack',
        tokens: 500,
        price: 7.99,
        description: '500 tokens with bonus value',
        popular: true
      },
      {
        id: 'premium',
        name: 'Premium Pack',
        tokens: 1000,
        price: 14.99,
        description: '1000 tokens - best value!'
      },
      {
        id: 'ultimate',
        name: 'Ultimate Pack',
        tokens: 2500,
        price: 34.99,
        description: '2500 tokens for power users'
      }
    ]
  });
});

// Shares page (redirect to dashboard route)
app.get('/shares', (req: Request, res: Response) => {
  res.redirect('/dashboard/shares');
});

// API Routes
app.get('/api/stats', async (req, res) => {
  try {
    // Get basic statistics
    const stats = {
      status: 'online',
      servers: 0, // This would be populated by the bot
      users: 0,
      transactions: 0,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Dashboard error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
export async function startDashboard() {
  try {
    // Initialize database connection
    await database.initialize();
    
    app.listen(port, () => {
      logger.info(`Dashboard running at http://localhost:${port}`);
    });
  } catch (error) {
    logger.error('Failed to start dashboard:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Dashboard shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Dashboard shutting down...');
  process.exit(0);
});

if (require.main === module) {
  startDashboard();
}

// Export for testing
export { app };

// Session types
declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      username: string;
      discriminator: string;
      avatar?: string;
      guilds?: any[];
    };
  }
} 