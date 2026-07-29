import { describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  it("passes through a value that resolves in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50, "fast")).resolves.toBe(
      "ok",
    );
  });

  it("passes through the original rejection when it loses the race", async () => {
    const boom = Promise.reject(new Error("upstream 503"));
    await expect(withTimeout(boom, 50, "fast")).rejects.toThrow("upstream 503");
  });

  it("rejects with a labelled TimeoutError when the budget expires", async () => {
    const stalled = new Promise((resolve) => setTimeout(resolve, 100));
    const err: unknown = await withTimeout(stalled, 10, "syncUser").catch(
      (e: unknown) => e,
    );
    if (!(err instanceof TimeoutError)) {
      throw new Error(`expected a TimeoutError, got ${String(err)}`);
    }
    expect(err.label).toBe("syncUser");
    expect(err.message).toContain("syncUser");
  });

  it("does not leave a late rejection unhandled", async () => {
    const onUnhandled = vi.fn();
    process.on("unhandledRejection", onUnhandled);

    // Loses the race, then fails afterwards — the exact shape of a hung
    // upstream call that errors out after we've already given up on it.
    const late = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("too late")), 20),
    );
    await expect(withTimeout(late, 5, "slow")).rejects.toBeInstanceOf(
      TimeoutError,
    );
    await new Promise((resolve) => setTimeout(resolve, 40));

    process.off("unhandledRejection", onUnhandled);
    expect(onUnhandled).not.toHaveBeenCalled();
  });

  it("clears its timer so a resolved call cannot fire late", async () => {
    vi.useFakeTimers();
    try {
      await withTimeout(Promise.resolve(1), 1000, "quick");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
