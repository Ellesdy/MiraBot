declare module 'coinbase-commerce-node' {
  export interface ChargeData {
    name: string;
    description: string;
    pricing_type: 'fixed_price' | 'no_price';
    local_price: {
      amount: string;
      currency: string;
    };
    metadata?: Record<string, string>;
    redirect_url?: string;
    cancel_url?: string;
  }

  export interface ChargeResponse {
    id: string;
    hosted_url: string;
    code: string;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
    confirmed_at?: string;
    pricing_type: string;
    metadata?: Record<string, string>;
    timeline?: Array<{
      time: string;
      status: string;
    }>;
    addresses?: Record<string, string>;
    pricing?: Record<string, {
      amount: string;
      currency: string;
    }>;
  }

  export interface WebhookEvent {
    id: string;
    type: string;
    data: any;
    created_at: string;
  }

  export class Client {
    static init(apiKey: string): void;
  }

  export class Charge {
    static create(data: ChargeData): Promise<ChargeResponse>;
    static retrieve(chargeId: string): Promise<ChargeResponse>;
    static list(): Promise<ChargeResponse[]>;
  }

  export class Webhook {
    static verifySigHeader(rawBody: string, signature: string, secret: string): void;
  }

  export interface Resource {
    id: string;
    resource: string;
    code?: string;
    name?: string;
    description?: string;
    hosted_url?: string;
    created_at?: string;
    updated_at?: string;
    confirmed_at?: string;
    metadata?: Record<string, any>;
  }

  export interface Checkout extends Resource {
    resource: 'checkout';
    logo_url?: string;
    requested_info?: string[];
  }

  export interface Event extends Resource {
    resource: 'event';
    type: string;
    data: any;
  }
} 