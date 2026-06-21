import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

const KEY = "test-consumer-key";
process.env.SNAPTRADE_CONSUMER_KEY = KEY;

// Isolate the route from the real sync/DB layer.
const syncUser = vi.fn(async (_id: string) => ({ accounts: 0, holdings: 0 }));
vi.mock("@/lib/sync", () => ({
  syncUser: (id: string) => syncUser(id),
  extractProviderError: (e: unknown) => e,
}));

// Single-user app: the webhook resolves the app user(s) via the admin client.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [{ id: "app-user-1" }] } }),
      },
    },
  }),
}));

import { POST } from "./route";

function sign(body: string): string {
  return createHmac("sha256", KEY).update(body, "utf8").digest("base64");
}

function makeReq(body: string, signature?: string): NextRequest {
  return new NextRequest("http://localhost/api/snaptrade/webhook", {
    method: "POST",
    body,
    headers: signature ? { Signature: signature } : {},
  });
}

describe("snaptrade webhook", () => {
  beforeEach(() => syncUser.mockClear());

  it("accepts a valid signature and syncs the app user on a connection event", async () => {
    const body = JSON.stringify({
      eventType: "CONNECTION_ADDED",
      userId: "snaptrade-account@example.com",
    });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);
    // Resolves the app user (auth.uid()), not the SnapTrade payload userId.
    expect(syncUser).toHaveBeenCalledWith("app-user-1");
  });

  it("rejects a tampered signature with 401 and does not sync", async () => {
    const body = JSON.stringify({
      eventType: "CONNECTION_ADDED",
      userId: "user-1",
    });
    const res = await POST(makeReq(body, sign("tampered")));
    expect(res.status).toBe(401);
    expect(syncUser).not.toHaveBeenCalled();
  });

  it("rejects a missing signature with 401", async () => {
    const body = JSON.stringify({ eventType: "CONNECTION_ADDED", userId: "u" });
    const res = await POST(makeReq(body));
    expect(res.status).toBe(401);
    expect(syncUser).not.toHaveBeenCalled();
  });

  it("ignores events that don't warrant a re-sync", async () => {
    const body = JSON.stringify({
      eventType: "CONNECTION_DELETED",
      userId: "user-1",
    });
    const res = await POST(makeReq(body, sign(body)));
    expect(res.status).toBe(200);
    expect(syncUser).not.toHaveBeenCalled();
  });
});
