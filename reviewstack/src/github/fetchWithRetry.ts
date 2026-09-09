/** Copyright (c) Meta Platforms, Inc. and affiliates. MIT license. */

export const GITHUB_RETRY_EVENT = 'reviewstack:github-retry';

const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_SERVER_DELAY_MS = 60_000;

export type GitHubRetryDetail = {
  attempt: number;
  delayMs: number;
  maxAttempts: number;
  operation: string;
};

type RetryOptions = {
  maxAttempts?: number;
  now?: () => number;
  random?: () => number;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  inspectResponse?: (response: Response) => Promise<boolean>;
};

export function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  operation: string,
  options: RetryOptions = {},
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? abortableSleep;

  const runAttempt = async (attempt: number): Promise<Response> => {
    throwIfAborted(init.signal);
    try {
      const response = await fetch(input, init);
      const retryable =
        isRetryableStatus(response) || (await options.inspectResponse?.(response.clone())) === true;
      if (!retryable || attempt >= maxAttempts) {
        return response;
      }

      const delayMs = retryDelay(response.headers, attempt, now(), random());
      if (delayMs == null) {
        return response;
      }
      announceRetry({attempt, delayMs, maxAttempts, operation});
      await sleep(delayMs, init.signal ?? undefined);
      return runAttempt(attempt + 1);
    } catch (error) {
      if (isAbortError(error) || attempt >= maxAttempts || !isNetworkError(error)) {
        throw error;
      }
      const delayMs = exponentialDelay(attempt, random());
      announceRetry({attempt, delayMs, maxAttempts, operation});
      await sleep(delayMs, init.signal ?? undefined);
      return runAttempt(attempt + 1);
    }
  };
  return runAttempt(1);
}

function isRetryableStatus(response: Response): boolean {
  if ([429, 502, 503, 504].includes(response.status)) {
    return true;
  }
  return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
}

function retryDelay(
  headers: Headers,
  attempt: number,
  nowMs: number,
  random: number,
): number | null {
  const retryAfter = headers.get('retry-after');
  if (retryAfter != null) {
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - nowMs;
    return boundedServerDelay(delay);
  }
  const reset = Number(headers.get('x-ratelimit-reset')) * 1000;
  if (Number.isFinite(reset) && reset > 0) {
    return boundedServerDelay(reset - nowMs);
  }
  return exponentialDelay(attempt, random);
}

function boundedServerDelay(delayMs: number): number | null {
  const delay = Math.max(0, delayMs);
  return delay <= MAX_SERVER_DELAY_MS ? delay : null;
}

function exponentialDelay(attempt: number, random: number): number {
  return Math.round(500 * 2 ** (attempt - 1) * (0.8 + random * 0.4));
}

function abortableSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Request was cancelled', 'AbortError'));
      return;
    }
    const timeout = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(signal.reason ?? new DOMException('Request was cancelled', 'AbortError'));
      },
      {once: true},
    );
  });
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Request was cancelled', 'AbortError');
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

function announceRetry(detail: GitHubRetryDetail): void {
  if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent(GITHUB_RETRY_EVENT, {detail}));
  }
}
