import { MiraClient } from '../client';
import { database } from '../../database/database';
import { logger } from '../../utils/logger';
import { config } from '../../utils/config';

// Payment provider interfaces
interface PaymentRequest {
  userId: string;
  amount: number; // USD amount
  tokens: number; // Tokens to award
  currency: 'USD' | 'EUR' | 'GBP' | 'CAD';
  provider: 'stripe' | 'coinbase';
}

interface PaymentResult {
  success: boolean;
  paymentUrl?: string;
  paymentId?: string;
  error?: string;
}

interface TokenPackage {
  id: string;
  name: string;
  tokens: number;
  priceUSD: number;
  priceEUR: number;
  priceGBP: number;
  priceCAD: number;
  description: string;
  popular?: boolean;
}

export class PaymentManager {
  private client: MiraClient;
  
  // Token packages available for purchase
  private tokenPackages: TokenPackage[] = [
    {
      id: 'starter',
      name: 'Starter Pack',
      tokens: 100,
      priceUSD: 1.99,
      priceEUR: 1.89,
      priceGBP: 1.69,
      priceCAD: 2.69,
      description: '100 tokens for basic actions'
    },
    {
      id: 'popular',
      name: 'Popular Pack',
      tokens: 500,
      priceUSD: 7.99,
      priceEUR: 7.49,
      priceGBP: 6.99,
      priceCAD: 10.99,
      description: '500 tokens with bonus value',
      popular: true
    },
    {
      id: 'premium',
      name: 'Premium Pack',
      tokens: 1000,
      priceUSD: 14.99,
      priceEUR: 13.99,
      priceGBP: 12.99,
      priceCAD: 19.99,
      description: '1000 tokens - best value!'
    },
    {
      id: 'ultimate',
      name: 'Ultimate Pack',
      tokens: 2500,
      priceUSD: 34.99,
      priceEUR: 32.99,
      priceGBP: 29.99,
      priceCAD: 47.99,
      description: '2500 tokens for power users'
    }
  ];

  constructor(client: MiraClient) {
    this.client = client;
  }

  public getTokenPackages(): TokenPackage[] {
    return this.tokenPackages;
  }

  public getTokenPackage(packageId: string): TokenPackage | null {
    return this.tokenPackages.find(pkg => pkg.id === packageId) || null;
  }

  public async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      switch (request.provider) {
        case 'stripe':
          return await this.createStripePayment(request);
        case 'coinbase':
          return await this.createCoinbasePayment(request);
        default:
          return { success: false, error: 'Unsupported payment provider' };
      }
    } catch (error) {
      logger.error('Error creating payment:', error);
      return { success: false, error: 'Payment creation failed' };
    }
  }

  private async createStripePayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // Import Stripe dynamically to avoid loading if not configured
      const stripe = await import('stripe');
      const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2023-10-16' as any
      });

      const session = await stripeClient.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: request.currency.toLowerCase(),
            product_data: {
              name: `${request.tokens} MiraPay Tokens`,
              description: `Purchase ${request.tokens} tokens for MiraPay Discord Bot`
            },
            unit_amount: Math.round(request.amount * 100) // Stripe uses cents
          },
          quantity: 1
        }],
        success_url: `${process.env.DASHBOARD_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.DASHBOARD_URL}/payment/cancel`,
        metadata: {
          userId: request.userId,
          tokens: request.tokens.toString(),
          provider: 'stripe'
        }
      });

      return {
        success: true,
        paymentUrl: session.url!,
        paymentId: session.id
      };
    } catch (error) {
      logger.error('Stripe payment creation failed:', error);
      return { success: false, error: 'Stripe payment failed' };
    }
  }

  private async createCoinbasePayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // Import Coinbase Commerce dynamically
      const coinbaseModule = await import('coinbase-commerce-node' as any);
      const { Client, Charge } = coinbaseModule;
      
      if (!process.env.COINBASE_COMMERCE_API_KEY) {
        return { success: false, error: 'Coinbase Commerce not configured' };
      }

      Client.init(process.env.COINBASE_COMMERCE_API_KEY);

      const chargeData = {
        name: `${request.tokens} MiraPay Tokens`,
        description: `Purchase ${request.tokens} tokens for MiraPay Discord Bot`,
        pricing_type: 'fixed_price' as const,
        local_price: {
          amount: request.amount.toString(),
          currency: request.currency
        },
        metadata: {
          userId: request.userId,
          tokens: request.tokens.toString(),
          provider: 'coinbase'
        },
        redirect_url: `${process.env.DASHBOARD_URL}/payment/success`,
        cancel_url: `${process.env.DASHBOARD_URL}/payment/cancel`
      };

      const charge = await Charge.create(chargeData);

      return {
        success: true,
        paymentUrl: charge.hosted_url,
        paymentId: charge.id
      };
    } catch (error) {
      logger.error('Coinbase payment creation failed:', error);
      return { success: false, error: 'Coinbase payment failed' };
    }
  }

  public async handleStripeWebhook(payload: string, signature: string): Promise<boolean> {
    try {
      const stripe = await import('stripe');
      const stripeClient = new stripe.default(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2023-10-16' as any
      });

      const event = stripeClient.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const userId = session.metadata.userId;
        const tokens = parseInt(session.metadata.tokens);

        await this.client.tokenManager.addTokens(
          userId,
          tokens,
          'Token purchase via Stripe',
          'payment'
        );

        logger.info(`Processed Stripe payment: ${tokens} tokens for user ${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Stripe webhook processing failed:', error);
      return false;
    }
  }

  public async handleCoinbaseWebhook(payload: any): Promise<boolean> {
    try {
      const coinbaseModule = await import('coinbase-commerce-node' as any);
      const { Webhook } = coinbaseModule;
      
      if (!process.env.COINBASE_WEBHOOK_SECRET) {
        return false;
      }

      // Verify webhook signature (implement based on Coinbase documentation)
      const event = payload;

      if (event.type === 'charge:confirmed') {
        const charge = event.data;
        const userId = charge.metadata.userId;
        const tokens = parseInt(charge.metadata.tokens);

        await this.client.tokenManager.addTokens(
          userId,
          tokens,
          'Token purchase via Coinbase',
          'payment'
        );

        logger.info(`Processed Coinbase payment: ${tokens} tokens for user ${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Coinbase webhook processing failed:', error);
      return false;
    }
  }

  public calculateTokenValue(tokens: number, currency: 'USD' | 'EUR' | 'GBP' | 'CAD'): number {
    // Base rate: $0.01 per token, with bulk discounts
    let baseRate = 0.01;
    
    // Apply bulk discounts
    if (tokens >= 2500) baseRate = 0.014; // 40% more expensive for small amounts
    else if (tokens >= 1000) baseRate = 0.015;
    else if (tokens >= 500) baseRate = 0.016;
    else if (tokens >= 100) baseRate = 0.02;
    else baseRate = 0.025; // Small purchases are more expensive per token

    const usdAmount = tokens * baseRate;

    // Convert to other currencies (approximate rates)
    const rates = {
      USD: 1.0,
      EUR: 0.85,
      GBP: 0.75,
      CAD: 1.35
    };

    return usdAmount * rates[currency];
  }
} 