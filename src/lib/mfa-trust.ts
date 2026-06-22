/**
 * Tamper-proof "trust this device" tokens for MFA. The token is an HMAC-SHA256
 * signature over a {uid, exp} payload, so it is bound to a specific user and
 * expires. Uses the Web Crypto API only, so the exact same code runs in both
 * the Edge middleware and the Node server action.
 */

export const TRUST_COOKIE = "mfa_trusted";
export const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToString(value: string): string {
  return atob(value.replace(/-/g, "+").replace(/_/g, "/"));
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

/** Constant-time comparison of two equal-length base64url signatures. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function createTrustToken(
  uid: string,
  secret: string,
): Promise<string> {
  const payload = stringToBase64Url(
    JSON.stringify({ uid, exp: Date.now() + TRUST_TTL_MS }),
  );
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifyTrustToken(
  token: string,
  uid: string,
  secret: string,
): Promise<boolean> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = await sign(payload, secret);
  if (!timingSafeEqual(signature, expected)) return false;

  try {
    const data = JSON.parse(base64UrlToString(payload)) as {
      uid?: unknown;
      exp?: unknown;
    };
    return (
      data.uid === uid && typeof data.exp === "number" && data.exp > Date.now()
    );
  } catch {
    return false;
  }
}
