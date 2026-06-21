import { Snaptrade } from "snaptrade-typescript-sdk";

/**
 * Server-only SnapTrade client. Reads partner credentials from env; the SDK signs
 * each request with the consumer key. Never import this into client components.
 */
export function getSnapTradeClient(): Snaptrade {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!clientId || !consumerKey) {
    throw new Error(
      "SNAPTRADE_CLIENT_ID and SNAPTRADE_CONSUMER_KEY must be set",
    );
  }
  return new Snaptrade({ clientId, consumerKey });
}
