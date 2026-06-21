import type { Account, Position } from "snaptrade-typescript-sdk";
import type {
  ConnectionCredential,
  DataProvider,
  InternalAccount,
  InternalHolding,
  InternalSecurity,
  ProviderConnection,
  ProviderSnapshot,
} from "../types";
import { getSnapTradeClient } from "./client";

/** `account_category` values that represent a liability rather than an asset. */
const DEBT_CATEGORIES = new Set(["LOC"]);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const todayISO = () => new Date().toISOString().slice(0, 10);

/** SnapTrade account → InternalAccount. */
export function mapAccount(a: Account): InternalAccount {
  const category = a.account_category ?? null;
  const balance = a.balance?.total ?? null;
  const number = a.number ?? null;
  return {
    externalId: a.id,
    name: a.name ?? a.institution_name ?? "Brokerage account",
    officialName: a.institution_name ?? null,
    // Normalized SnapTrade category (INVESTMENT/DEPOSIT/LOC); default to investment.
    type: category ? category.toLowerCase() : "investment",
    // Brokerage's own label ("Roth IRA", "Individual") — feeds tax classification.
    subtype: a.raw_type ?? null,
    currentBalance: balance?.amount ?? null,
    availableBalance: balance?.amount ?? null,
    isoCurrency: balance?.currency ?? "USD",
    mask: number ? number.slice(-4) : null,
    isDebt: category != null && DEBT_CATEGORIES.has(category),
  };
}

/** SnapTrade position → InternalSecurity (reference data). Null if no symbol. */
export function mapSecurity(pos: Position): InternalSecurity | null {
  const sym = pos.symbol?.symbol; // nested UniversalSymbol carries the real data
  if (!sym?.id) return null;
  return {
    externalId: sym.id,
    ticker: sym.symbol ?? null,
    name: sym.description ?? null,
    securityType: sym.type?.code ?? null, // "cs", "et", …
    closePrice: pos.price ?? null,
    closePriceAsOf: todayISO(),
    isoCurrency: sym.currency?.code ?? "USD",
    isCashEquivalent: pos.cash_equivalent ?? false,
  };
}

/**
 * SnapTrade position → InternalHolding. Cost basis is reconstructed from the
 * per-share `average_purchase_price` × `units` (SnapTrade has no lump cost basis).
 */
export function mapHolding(
  accountExternalId: string,
  pos: Position,
): InternalHolding | null {
  const sym = pos.symbol?.symbol;
  if (!sym?.id) return null;
  const units = pos.units ?? null;
  const avg = pos.average_purchase_price ?? null;
  const price = pos.price ?? null;
  return {
    accountExternalId,
    securityExternalId: sym.id,
    quantity: units,
    costBasis: units != null && avg != null ? round2(units * avg) : null,
    institutionPrice: price,
    institutionValue:
      units != null && price != null ? round2(units * price) : null,
    isoCurrency: pos.currency?.code ?? sym.currency?.code ?? "USD",
    asOfDate: todayISO(),
  };
}

export class SnapTradeProvider implements DataProvider {
  readonly name = "snaptrade" as const;

  async listConnections(
    snapTradeUserId: string,
    userSecret: string,
  ): Promise<ProviderConnection[]> {
    const client = getSnapTradeClient();
    const res = await client.accountInformation.listUserAccounts({
      userId: snapTradeUserId,
      userSecret,
    });
    // Accounts share a brokerage_authorization; collapse to one per authorization.
    const byAuth = new Map<string, ProviderConnection>();
    for (const a of res.data) {
      const authId = a.brokerage_authorization;
      if (!authId || byAuth.has(authId)) continue;
      byAuth.set(authId, {
        authorizationId: authId,
        institutionName: a.institution_name ?? null,
      });
    }
    return [...byAuth.values()];
  }

  async fetchConnection(cred: ConnectionCredential): Promise<ProviderSnapshot> {
    const client = getSnapTradeClient();
    const auth = { userId: cred.snapTradeUserId, userSecret: cred.userSecret };

    const accountsRes = await client.accountInformation.listUserAccounts(auth);
    const rawAccounts = accountsRes.data.filter(
      (a) => a.brokerage_authorization === cred.authorizationId,
    );

    const accounts = rawAccounts.map(mapAccount);
    const securities = new Map<string, InternalSecurity>(); // dedupe by symbol id
    const holdings: InternalHolding[] = [];

    for (const acct of rawAccounts) {
      const posRes = await client.accountInformation.getUserAccountPositions({
        ...auth,
        accountId: acct.id,
      });
      for (const pos of posRes.data) {
        const sec = mapSecurity(pos);
        if (sec && !securities.has(sec.externalId)) {
          securities.set(sec.externalId, sec);
        }
        const holding = mapHolding(acct.id, pos);
        if (holding) holdings.push(holding);
      }
    }

    return { accounts, securities: [...securities.values()], holdings };
  }
}
