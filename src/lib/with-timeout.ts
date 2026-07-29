/**
 * Rejects with a labelled TimeoutError when a promise outlives its budget.
 * The label is ours, never a provider string, so it is safe to return in an
 * API response — the point is that a stalled stage names itself without
 * anyone having to go read the logs.
 */
export class TimeoutError extends Error {
  readonly label: string;

  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
    this.label = label;
  }
}

/**
 * Reject if `promise` hasn't settled within `ms`.
 *
 * The underlying work is abandoned, not cancelled — nothing here can stop an
 * in-flight HTTP request. Callers that *can* cancel (anything taking an
 * AbortSignal) should do that too, with a slightly shorter budget, so the
 * cancelling timeout fires first and this one stays a backstop.
 *
 * Promise.race attaches handlers to `promise`, so a late rejection after we've
 * already moved on is still handled and can't crash the process.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
