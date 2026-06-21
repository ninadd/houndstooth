import { getSnapTradeClient } from "./client";

/**
 * Generate a Connection Portal URL for the user to connect a brokerage. The URL
 * expires in ~5 minutes, so generate it on demand (at click time), not ahead.
 * `connectionType: "read"` requests data-only access (no trading scope).
 */
export async function generatePortalUrl(
  snapTradeUserId: string,
  userSecret: string,
  customRedirect?: string,
): Promise<string> {
  const client = getSnapTradeClient();
  const res = await client.authentication.loginSnapTradeUser({
    userId: snapTradeUserId,
    userSecret,
    connectionType: "read",
    ...(customRedirect ? { customRedirect } : {}),
  });
  // The 200 body is a union; the connect-portal variant carries `redirectURI`.
  const data = res.data as { redirectURI?: string };
  if (!data.redirectURI) {
    throw new Error("SnapTrade login did not return a redirectURI");
  }
  return data.redirectURI;
}
