import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  type Products,
} from "plaid";

/**
 * Server-only Plaid client. Reads credentials from env.
 * PLAID_ENV is one of: sandbox | production.
 */
export function getPlaidClient(): PlaidApi {
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;

  const configuration = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
      },
    },
  });

  return new PlaidApi(configuration);
}

/** Products we request during Link. Investments is the core; liabilities adds debts. */
export const PLAID_PRODUCTS: Products[] = ["investments", "liabilities"] as Products[];
export const PLAID_COUNTRY_CODES = ["US"];
