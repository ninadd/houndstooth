/** localStorage key holding the active Plaid link_token across the OAuth redirect. */
export const LINK_TOKEN_KEY = "plaid_link_token";

/** Exchange a public_token for a stored access token via our server route. */
export async function exchangePublicToken(
  publicToken: string,
): Promise<{ accounts: number; holdings: number }> {
  const res = await fetch("/api/plaid/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_token: publicToken }),
  });
  if (!res.ok) throw new Error("exchange failed");
  return res.json();
}
