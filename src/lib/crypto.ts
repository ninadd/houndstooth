import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * AES-256-GCM encryption for secrets at rest (Plaid access tokens).
 * Server-only. The key comes from TOKEN_ENCRYPTION_KEY: a 32-byte key,
 * base64-encoded. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Ciphertext format (base64):  [12-byte IV][16-byte auth tag][ciphertext]
 */

const IV_LENGTH = 12; // GCM standard nonce length
const TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`,
    );
  }
  return key;
}

/** Encrypts a UTF-8 string, returning base64 (iv | tag | ciphertext). */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypts base64 (iv | tag | ciphertext) back to the original string. */
export function decrypt(payload: string): string {
  const key = getKey();
  const data = Buffer.from(payload, "base64");
  if (data.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Ciphertext is too short to be valid");
  }
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
