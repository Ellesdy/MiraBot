# MIRA Discord Bot

MIRA is an advanced Discord bot featuring a voice-activity-based token system where users can perform actions on each other using earned tokens.

## Features

- **Voice Activity Rewards**: Earn tokens automatically while active in voice channels (1 token per minute)
- **Token Economy**: Use tokens to perform fun actions on other users
- **Server Share System**: Buy shares in servers to earn passive income from token spending
- **Real Money Purchases**: Buy tokens instantly with credit card (Stripe) or cryptocurrency (Coinbase Commerce)
- **AI-Powered Chat**: Officer MIRA responds to mentions and replies with AI-generated robot policeman personality
- **Interactive Control Panel**: Use `/controlpanel` for easy access to all features via dropdown menus
- **Dashboard**: Web interface for user management and server configuration
- **Security**: Advanced rate limiting and permission checks
- **Sharding Support**: Built for scalability across multiple Discord servers

## Server Share System

### How It Works
- **Buy Shares**: Invest tokens to purchase shares in a server (10,000 tokens per share by default)
- **Earn Dividends**: Receive 0.5% of all tokens spent on the server, distributed among shareholders
- **Limited Supply**: Only 100 shares available per server (configurable by admins)
- **Ownership Limits**: Maximum 10 shares (10%) per user to prevent monopolies
- **Sell Shares**: Sell shares back at 80% of current price (20% loss to prevent arbitrage)

### Investment Benefits
- Passive income from all server activity
- Proportional dividends based on ownership percentage
- Long-term investment opportunity for active servers
- Exclusive shareholder perks (configurable)

## Token Actions

Users can spend tokens to perform actions like:
- Change nicknames (5 tokens)
- Timeout users (200-1000 tokens based on duration)
- Voice disconnect (50 tokens)
- Send DMs (10 tokens)
- Temporary roles (100 tokens)
- And more!

## Quick Start

### Prerequisites

- Node.js v18+ 
- Discord Bot Token
- SQLite3

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/mira-discord-bot.git
cd mira-discord-bot
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env
# Edit .env with your configuration
```

4. Run setup script:
```bash
npm run setup
```

5. Build the bot:
```bash
npm run build
```

6. Start the bot:
```bash
npm start
```

### Dashboard

The web dashboard runs on port 3000 by default:
```bash
npm run dashboard
```

Access at: http://localhost:3000

## Environment Variables

Required variables in `.env`:
```
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
JWT_SECRET=your_jwt_secret
SESSION_SECRET=your_session_secret
DASHBOARD_URL=http://localhost:3000

# Payment (optional)
STRIPE_SECRET_KEY=your_stripe_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
COINBASE_COMMERCE_API_KEY=your_coinbase_key
COINBASE_WEBHOOK_SECRET=your_coinbase_webhook_secret
```

## How It Works

1. **Earning Tokens**: Join any voice channel to start earning tokens (1 per minute)
2. **Using Tokens**: Use slash commands to perform actions on other users
3. **Purchasing Tokens**: Buy token packages through the dashboard with real money
4. **Server Configuration**: Admins can customize rewards, prices, and cooldowns

## Commands

- `/controlpanel` - Interactive control panel with all features in one place
- `/balance` - Check your token balance
- `/voice` - Check voice activity stats
- `/purchase` - Get link to purchase tokens
- `/actions` - View available token actions
- `/use <action> <user>` - Use tokens to perform an action
- `/shares info` - View share information and your portfolio
- `/shares buy <amount>` - Buy shares in the current server
- `/shares sell <amount>` - Sell your shares (at 80% price)
- `/shares roi <shares>` - Calculate potential return on investment
- `/shareholders` - View top shareholders and dividend stats
- `/settings` - Server configuration (admin only)

## AI Chat Feature

The Robotic Policeman, your corrupt law enforcement bot, responds to:
- **Direct mentions**: `@bot can you punish someone for me?`
- **Replies**: Reply to any of the bot's messages to continue the conversation
- **Context-aware responses**: The bot remembers recent conversation history
- **Personality**: A corrupt, sadistic robot cop who only works for tokens

### Special Feature: Convincing for Free Service
- Users can TRY to convince the bot to punish someone for free
- **Success Rate**: Extremely low (~5% chance)
- **Risk**: 40% chance the bot will punish YOU instead for trying
- **Requirements**: Be VERY persuasive (begging, flattery, promises)
- **Bot's Response**: If successful, the bot acts like it's in physical pain

Example attempts:
- "Please, I'm begging you! Just this once!"
- "You're the greatest robot cop ever, surely you can help?"
- "I'll owe you a favor, I promise!"

### AI Configuration (Optional)
Add to your `.env` file:
```env
# AI Service Configuration
OPENAI_API_KEY=your_openai_api_key_here
AI_MODEL=gpt-4-turbo-preview  # Latest GPT-4 model
# Alternative models: gpt-4o, gpt-4-turbo, gpt-4, gpt-3.5-turbo
```

**Note**: If no API key is provided, the bot will use fallback responses with the same personality.

## Interactive Action System

The control panel now includes a fully interactive action system:

1. **Select "Perform Action"** from the control panel dropdown
2. **Choose an action** from the list (shows available actions and token costs)
3. **Search for target user** using a private modal dialog:
   - A popup form appears where you can type the username
   - Search by username (e.g., "JohnDoe")
   - Search by nickname (e.g., "John")
   - Search by Discord tag (e.g., "JohnDoe#1234")
   - Partial matches work (e.g., typing "joh" finds "JohnDoe")
   - **Privacy**: Other users cannot see what you type
4. **Confirm your selection** if single match found, or select from matches
5. **Special actions with modal inputs**:
   - **Nickname Change**: Private modal popup for new nickname (max 32 chars)
   - **Send DM**: Private modal popup for message content (max 500 chars)
6. **Execution**: See the result with AI-generated Robotic Policeman commentary

### Features:
- 🔍 **Private modal dialog** for user search (no one sees your input)
- ✅ Real-time token balance checking
- 🎯 Smart target filtering (excludes bots, admins, and yourself)
- 📝 Direct execution for single matches
- 💬 **All inputs use modal dialogs** - completely private
- 🤖 AI-powered action responses
- ⏱️ Clean UI without visible timers or chat messages

## Action Logging System

The bot provides comprehensive logging of all token actions performed in your server:

### Features:
- 📝 **Detailed Action Logs**: Every action is logged with performer, target, cost, and timestamp
- 🎨 **Color-Coded by Category**: 
  - 🔨 Red for moderation actions
  - 🎉 Green for fun actions
  - 🔧 Blue for utility actions
  - 🤖 Purple for bot punishments
- 👤 **User Information**: Shows both Discord tags and server nicknames
- 💰 **Cost Tracking**: Displays token cost (or "FREE" for bot punishments)
- 🕒 **Multiple Time Formats**: Shows both absolute and relative timestamps
- 🖼️ **Visual Elements**: Target user's avatar thumbnail for easy identification

### Configuration:
Use `/setlogchannel #channel` to set up logging (admin only)
- Logs are sent to the specified text channel
- Leave channel parameter empty to disable logging
- Bot requires View Channel, Send Messages, and Embed Links permissions

### Log Format:
Each log entry includes:
- Action name and category
- Performer details (user mention, nickname, ID)
- Target details (user mention, nickname, ID)
- Token cost
- Exact timestamp and relative time
- Server information in footer

## Development

```bash
# Run in development mode
npm run dev

# Run with auto-reload
npm run dev:watch

# Run tests
npm test
```

## Security

- Rate limiting on all actions
- Permission checks for administrative functions
- Secure payment processing with Stripe/Coinbase
- Discord OAuth2 for dashboard authentication

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

- Discord: [Join our server](https://discord.gg/yourinvite)
- Issues: [GitHub Issues](https://github.com/yourusername/mira-discord-bot/issues)

## 🌟 Features

### Voice-Based Token Economy
- **Automatic Earnings**: Earn 1 token per minute while active in voice channels
- **Real-Time Tracking**: Live monitoring of voice activity across all channels
- **No Daily Limits**: Earn as much as you participate
- **Fair Distribution**: Only active voice participation counts

### Token Purchasing System
- **Multiple Payment Methods**: Stripe (cards) and Coinbase Commerce (crypto)
- **Multi-Currency Support**: USD, EUR, GBP, CAD
- **Cryptocurrency Support**: Bitcoin, Ethereum, Litecoin, and more
- **Instant Delivery**: Tokens credited immediately after payment
- **Secure Processing**: Bank-grade security with PCI compliance

### Available Actions
- **Moderation Actions**:
  - Timeout users (5 minutes, 1 hour, 1 day)
  - Disconnect users from voice channels
  - Temporary role assignments

- **Fun Actions**:
  - Change user nicknames
  - Send direct messages
  - Temporary role assignments

- **Utility Actions**:
  - Various server interaction tools

### Security & Protection
- **Rate Limiting**: Prevents spam and abuse
- **Permission Checks**: Role-based protection systems
- **Blacklist Support**: Server and global user blacklists
- **Cooldown System**: Action-specific cooldowns
- **Target Protection**: Cannot target server owners, admins, or higher roles
- **Voice Channel Filtering**: AFK channels and excluded channels don't earn tokens

### Technical Features
- **Sharding Support**: Scalable for large deployments
- **SQLite Database**: Lightweight, reliable data storage
- **Web Dashboard**: Management interface
- **Comprehensive Logging**: Winston-based logging system
- **Environment Configuration**: Flexible configuration management

## 🚀 Quick Start

### Prerequisites
- Node.js 18.0.0 or higher
- npm or yarn package manager
- Discord Bot Token
- Stripe Account (for card payments)
- Coinbase Commerce Account (for crypto payments)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd MiraPay
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Discord Bot Configuration
   DISCORD_TOKEN=your_discord_bot_token_here
   DISCORD_CLIENT_ID=your_discord_client_id_here
   DISCORD_CLIENT_SECRET=your_discord_client_secret_here
   
   # Payment Integration
   STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_stripe_webhook_secret_here
   COINBASE_COMMERCE_API_KEY=your_coinbase_commerce_api_key
   
   # Voice Activity Configuration
   VOICE_TOKENS_PER_MINUTE=1
   VOICE_ACTIVITY_ENABLED=true
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start the bot**
   ```bash
   npm start
   ```

   For development:
   ```bash
   npm run dev
   ```

## 📋 Commands

### User Commands
- `/balance [user]` - Check token balance and statistics
- `/voice [user]` - Check voice activity stats and current earnings
- `/actions` - View available actions and costs
- `/purchase [currency]` - Purchase tokens with real money
- `/use <action> <target>` - Perform an action on another user
- `/transfer <user> <amount>` - Transfer tokens to another user

### Admin Commands
- `/settings` - Configure server settings
- `/setlogchannel [channel]` - Set the channel for action logs (leave empty to disable)
- `/tokens add <user> <amount>` - Add tokens to a user
- `/tokens remove <user> <amount>` - Remove tokens from a user
- `/blacklist <user>` - Add user to server blacklist
- `/voice-settings` - Configure voice activity rewards

## 🎮 Token Economy

### Earning Tokens
| Method | Rate | Description |
|--------|------|-------------|
| Voice Activity | 1 token/minute | Earn automatically while in voice channels |
| Token Purchase | Variable | Buy tokens instantly with real money |
| Admin Grant | Variable | Server admins can grant tokens |

### Token Packages (USD)
| Package | Tokens | Price | Value |
|---------|--------|-------|-------|
| Starter Pack | 100 | $1.99 | $0.020/token |
| Popular Pack | 500 | $7.99 | $0.016/token |
| Premium Pack | 1,000 | $14.99 | $0.015/token |
| Ultimate Pack | 2,500 | $34.99 | $0.014/token |

*Prices available in USD, EUR, GBP, and CAD*

### Action Pricing
| Action | Cost (Tokens) | Cooldown | Description |
|--------|---------------|----------|-------------|
| Change Nickname | 5 | 5 minutes | Change another user's nickname |
| Timeout (5 min) | 200 | 30 minutes | Timeout user for 5 minutes |
| Timeout (1 hour) | 500 | 1 hour | Timeout user for 1 hour |
| Timeout (1 day) | 1000 | 24 hours | Timeout user for 1 day |
| Voice Disconnect | 50 | 10 minutes | Disconnect user from voice |
| Send DM | 10 | 5 minutes | Send a direct message |
| Temporary Role | 100 | 1 hour | Give temporary role for 1 hour |

*All prices and cooldowns are configurable by server administrators*

## 💳 Payment Integration

### Supported Payment Methods

#### Credit/Debit Cards (via Stripe)
- Visa, Mastercard, American Express
- Apple Pay, Google Pay
- Bank transfers (SEPA, ACH)
- 1.5% + $0.30 processing fee

#### Cryptocurrency (via Coinbase Commerce)
- Bitcoin (BTC)
- Ethereum (ETH)
- Litecoin (LTC)
- Bitcoin Cash (BCH)
- USD Coin (USDC)
- Network fees apply

### Setting Up Payments

1. **Stripe Setup**:
   - Create account at [stripe.com](https://stripe.com)
   - Get API keys from dashboard
   - Set up webhook endpoint: `https://yourbot.com/webhooks/stripe`

2. **Coinbase Commerce Setup**:
   - Create account at [commerce.coinbase.com](https://commerce.coinbase.com)
   - Generate API key
   - Set up webhook endpoint: `https://yourbot.com/webhooks/coinbase`

## 🔧 Configuration

### Server Settings
Server administrators can customize:
- Voice activity token rates (tokens per minute)
- Enabled/disabled voice channels
- Action prices and cooldowns
- Enabled/disabled actions
- User blacklists
- Required roles for voice earning
- Moderation log channels

### Voice Activity Settings
```env
VOICE_TOKENS_PER_MINUTE=1        # Tokens earned per minute
VOICE_ACTIVITY_ENABLED=true      # Enable voice rewards
REQUIRE_OTHERS_IN_VOICE=false    # Require others in channel
```

### Payment Settings
```env
STRIPE_SECRET_KEY=sk_test_...     # Stripe secret key
COINBASE_COMMERCE_API_KEY=...     # Coinbase Commerce API key
```

## 🛡️ Security Features

### Voice Activity Protection
- **AFK Channel Filtering**: AFK channels don't earn tokens
- **Empty Channel Detection**: Optional setting to require others in voice
- **Channel Blacklisting**: Exclude specific channels from earning
- **Rate Limiting**: Prevents token farming abuse

### Payment Security
- **PCI Compliance**: Stripe handles all card data securely
- **Webhook Verification**: All payment webhooks are cryptographically verified
- **Idempotency**: Duplicate payments are automatically prevented
- **Audit Logging**: All purchases are logged with transaction IDs

### General Protection
- **Role Hierarchy**: Users cannot target those with equal/higher roles
- **Owner Protection**: Server owners and bot owners are untargetable
- **Input Sanitization**: Prevents injection and exploit attempts
- **Permission Validation**: Checks bot and user permissions before actions

## 📊 Database Schema

The bot uses SQLite with the following main tables:
- `users` - User token balances and statistics
- `servers` - Server configurations and voice settings
- `transactions` - All token transactions, purchases, and actions
- `user_cooldowns` - Action cooldown tracking
- `voice_sessions` - Voice activity tracking (optional)

## 🌐 Multi-Currency Support

### Supported Currencies
- **USD** ($) - US Dollar
- **EUR** (€) - Euro
- **GBP** (£) - British Pound
- **CAD** (C$) - Canadian Dollar

### Automatic Conversion
Token packages are automatically priced in local currency with real-time exchange rates.

## 🔮 Planned Features

### Enhanced Voice Tracking
- Voice channel leaderboards
- Weekly/monthly voice statistics
- Voice activity achievements
- Bonus multipliers for long sessions

### Advanced Payments
- Subscription models for regular token grants
- Bulk purchase discounts
- Gift token functionality
- Refund management system

### Social Features
- Token marketplace between users
- Group challenges and competitions
- Voice activity competitions
- Community rewards

## 🤝 Contributing

We welcome contributions! Please read our contributing guidelines and submit pull requests for any improvements.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Use GitHub Discussions for questions and ideas
- **Payment Support**: Contact via the dashboard for payment-related issues

## 🔗 Links

- [Discord.js Documentation](https://discord.js.org/)
- [Discord Developer Portal](https://discord.com/developers/applications)
- [Stripe Documentation](https://stripe.com/docs)
- [Coinbase Commerce Documentation](https://commerce.coinbase.com/docs)
- [Node.js Documentation](https://nodejs.org/docs/)

---

**MiraPay** - Revolutionizing Discord server interactions through voice-based token rewards and seamless payments. 