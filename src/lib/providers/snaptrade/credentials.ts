/**
 * Personal-tier SnapTrade credentials.
 *
 * Personal keys (clientId `PERS-…`) auto-provision a single user at signup —
 * `registerUser` is not available. So there is one fixed `userId` + `userSecret`,
 * supplied via env, used for every SnapTrade call. Returns null when unset.
 */
export type SnapTradeCredentials = { userId: string; userSecret: string };

export function snapTradeCredentials(): SnapTradeCredentials | null {
  const userId = process.env.SNAPTRADE_USER_ID;
  const userSecret = process.env.SNAPTRADE_USER_SECRET;
  if (!userId || !userSecret) return null;
  return { userId, userSecret };
}
