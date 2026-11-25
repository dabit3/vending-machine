import { ConvexError } from "convex/values";

export type ClaimRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Retries transient mutation failures (e.g. tail-end OCC write conflicts when
// many attendees claim the final codes simultaneously). Never retries
// ConvexError (application errors). Safe because claims.claim is idempotent.
export async function withClaimRetry<T>(
  run: () => Promise<T>,
  options: ClaimRetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 120;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ConvexError || attempt === maxAttempts) {
        throw error;
      }
      lastError = error;
      const delay = baseDelayMs * attempt + Math.floor(random() * baseDelayMs);
      await sleep(delay);
    }
  }
  throw lastError;
}
