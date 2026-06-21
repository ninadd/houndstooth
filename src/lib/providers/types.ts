/**
 * Internal data schema + provider contract.
 *
 * The rest of the app (sync/ingest, dashboard, snapshot, Gemini) depends only on
 * these shapes — never on a provider's SDK. A `DataProvider` fetches from an
 * external source (SnapTrade, or a Mock for tests) and returns this shape, so the
 * provider can be swapped without touching application logic.
 */

export type InternalAccount = {
  /** Provider's account id → `accounts.external_account_id`. */
  externalId: string;
  name: string;
  officialName: string | null;
  /** Normalized category: "investment" | "deposit" | "loc" | … */
  type: string | null;
  /** Brokerage's own label, e.g. "Roth IRA", "Individual" — feeds tax classification. */
  subtype: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  isoCurrency: string;
  mask: string | null;
  isDebt: boolean;
};

export type InternalSecurity = {
  /** Provider's security id → `securities.external_security_id`. */
  externalId: string;
  ticker: string | null;
  name: string | null;
  securityType: string | null;
  closePrice: number | null;
  closePriceAsOf: string | null;
  isoCurrency: string;
  isCashEquivalent: boolean;
};

export type InternalHolding = {
  accountExternalId: string;
  securityExternalId: string;
  quantity: number | null;
  costBasis: number | null;
  institutionPrice: number | null;
  institutionValue: number | null;
  isoCurrency: string;
  asOfDate: string | null;
};

export type ProviderSnapshot = {
  accounts: InternalAccount[];
  securities: InternalSecurity[];
  holdings: InternalHolding[];
};

/** One brokerage connection discovered under a user. */
export type ProviderConnection = {
  authorizationId: string;
  institutionName: string | null;
};

/** Everything needed to pull a single connection's data. */
export type ConnectionCredential = {
  snapTradeUserId: string;
  userSecret: string;
  authorizationId: string;
};

export interface DataProvider {
  readonly name: "snaptrade" | "mock";
  /** Discover the brokerage authorizations currently under a user. */
  listConnections(
    snapTradeUserId: string,
    userSecret: string,
  ): Promise<ProviderConnection[]>;
  /** Pull accounts + securities + holdings for one connection. */
  fetchConnection(credential: ConnectionCredential): Promise<ProviderSnapshot>;
}
