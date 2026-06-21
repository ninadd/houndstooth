import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

beforeAll(() => {
  // Deterministic 32-byte key for the test run.
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("crypto", () => {
  it("round-trips a SnapTrade-like userSecret", () => {
    const token = "9f1c2e3a-1234-5678-9abc-def012345678";
    const ciphertext = encrypt(token);
    expect(ciphertext).not.toContain(token);
    expect(decrypt(ciphertext)).toBe(token);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const token = "same-secret";
    expect(encrypt(token)).not.toBe(encrypt(token));
  });

  it("fails to decrypt tampered ciphertext (auth tag)", () => {
    const data = Buffer.from(encrypt("secret"), "base64");
    data[data.length - 1] ^= 0xff; // flip a bit in the ciphertext
    expect(() => decrypt(data.toString("base64"))).toThrow();
  });

  it("rejects a key of the wrong length", () => {
    const original = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    expect(() => encrypt("x")).toThrow(/32 bytes/);
    process.env.TOKEN_ENCRYPTION_KEY = original;
  });
});
