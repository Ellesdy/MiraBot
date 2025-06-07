import { Router, Request, Response } from 'express';
import express from 'express';
import { MiraClient } from '../../bot/client';
import { database } from '../../database/database';
import { logger } from '../../utils/logger';
import { requireAuth } from './auth';
import { config } from '../../utils/config';

const paymentRouter = Router();

// Token packages
const tokenPackages = [
  { id: 'starter', tokens: 100, priceUSD: 1.99 },
  { id: 'popular', tokens: 500, priceUSD: 7.99 },
  { id: 'premium', tokens: 1000, priceUSD: 14.99 },
  { id: 'ultimate', tokens: 2500, priceUSD: 34.99 }
];

// Create Stripe checkout session
paymentRouter.post('/stripe/checkout', requireAuth, async (req: Request, res: Response) => {
  try {
    const { packageId, currency = 'USD' } = req.body;
    const userId = req.session.user!.id;
    
    const tokenPackage = tokenPackages.find(p => p.id === packageId);
    if (!tokenPackage) {
      return res.status(400).json({ error: 'Invalid package' });
    }
    
    // Import Stripe dynamically
    const stripe = await import('stripe');
    const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16' as any
    });
    
    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: `${tokenPackage.tokens} MIRA Tokens`,
            description: `Purchase ${tokenPackage.tokens} tokens for MIRA Discord Bot`
          },
          unit_amount: Math.round(tokenPackage.priceUSD * 100) // Convert to cents
        },
        quantity: 1
      }],
      success_url: `${config.dashboard.url}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.dashboard.url}/payment/cancel`,
      metadata: {
        userId,
        tokens: tokenPackage.tokens.toString(),
        packageId: tokenPackage.id
      }
    });
    
    return res.json({ checkoutUrl: session.url });
  } catch (error) {
    logger.error('Stripe checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Create Coinbase charge
paymentRouter.post('/coinbase/charge', requireAuth, async (req: Request, res: Response) => {
  try {
    const { packageId, currency = 'USD' } = req.body;
    const userId = req.session.user!.id;
    
    const tokenPackage = tokenPackages.find(p => p.id === packageId);
    if (!tokenPackage) {
      return res.status(400).json({ error: 'Invalid package' });
    }
    
    // Import Coinbase Commerce dynamically
    const coinbaseModule = await import('coinbase-commerce-node' as any);
    const { Client, Charge } = coinbaseModule;
    
    if (!process.env.COINBASE_COMMERCE_API_KEY) {
      return res.status(500).json({ error: 'Coinbase Commerce not configured' });
    }
    
    Client.init(process.env.COINBASE_COMMERCE_API_KEY);
    
    const chargeData = {
      name: `${tokenPackage.tokens} MIRA Tokens`,
      description: `Purchase ${tokenPackage.tokens} tokens for MIRA Discord Bot`,
      pricing_type: 'fixed_price' as const,
      local_price: {
        amount: tokenPackage.priceUSD.toString(),
        currency: currency
      },
      metadata: {
        userId,
        tokens: tokenPackage.tokens.toString(),
        packageId: tokenPackage.id
      },
      redirect_url: `${config.dashboard.url}/payment/success`,
      cancel_url: `${config.dashboard.url}/payment/cancel`
    };
    
    const charge = await Charge.create(chargeData);
    
    return res.json({ checkoutUrl: charge.hosted_url });
  } catch (error) {
    logger.error('Coinbase charge error:', error);
    return res.status(500).json({ error: 'Failed to create charge' });
  }
});

// Stripe webhook
paymentRouter.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const stripe = await import('stripe');
    const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16' as any
    });
    
    const sig = req.headers['stripe-signature'] as string;
    const event = stripeClient.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const { userId, tokens, packageId } = session.metadata;
      
      // Add tokens to user
      await database.updateUserTokens(
        userId,
        parseInt(tokens),
        'earn'
      );
      
      // Log transaction
      await database.addTransaction({
        userId,
        serverId: 'payment',
        type: 'earn',
        amount: parseInt(tokens),
        description: `Purchased ${tokens} tokens (${packageId} package)`
      });
      
      logger.info(`Payment successful: ${tokens} tokens for user ${userId}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    logger.error('Stripe webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// Coinbase webhook
paymentRouter.post('/coinbase/webhook', async (req: Request, res: Response) => {
  try {
    const coinbaseModule = await import('coinbase-commerce-node' as any);
    const { Webhook } = coinbaseModule;
    
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-cc-webhook-signature'] as string;
    const webhookSecret = process.env.COINBASE_WEBHOOK_SECRET!;
    
    Webhook.verifySigHeader(rawBody, signature, webhookSecret);
    
    const event = req.body;
    
    if (event.type === 'charge:confirmed') {
      const charge = event.data;
      const { userId, tokens, packageId } = charge.metadata;
      
      // Add tokens to user
      await database.updateUserTokens(
        userId,
        parseInt(tokens),
        'earn'
      );
      
      // Log transaction
      await database.addTransaction({
        userId,
        serverId: 'payment',
        type: 'earn',
        amount: parseInt(tokens),
        description: `Purchased ${tokens} tokens (${packageId} package)`
      });
      
      logger.info(`Payment successful: ${tokens} tokens for user ${userId}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    logger.error('Coinbase webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// Payment success page
paymentRouter.get('/success', requireAuth, (req: Request, res: Response) => {
  res.render('payment-success', {
    user: req.session.user
  });
});

// Payment cancel page
paymentRouter.get('/cancel', requireAuth, (req: Request, res: Response) => {
  res.render('payment-cancel', {
    user: req.session.user
  });
});

export { paymentRouter }; 