/**
 * Shared request pacing and retry configuration for all stock API clients.
 */

export const REQUEST_DELAY_MIN_MS = 1000;
export const REQUEST_DELAY_MAX_MS = 3000;
export const MAX_RETRIES = 3;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const pause = (extraMs = 0): Promise<void> =>
  sleep(
    REQUEST_DELAY_MIN_MS +
      Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS) +
      extraMs
  );
