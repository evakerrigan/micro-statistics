/**
 * Calls Shutterstock Contributor's internal `/api/next/...` endpoints from
 * inside an open `submit.shutterstock.com` tab (`world: 'MAIN'`), so requests
 * carry the user's existing login session and cookies exactly like the site's
 * own requests do. Nothing is stored or sent anywhere else.
 */

export const SHUTTERSTOCK_ORIGIN = 'https://submit.shutterstock.com';
const SHUTTERSTOCK_TAB_PATH = '/en/dashboard';

// Gentle pacing: short delay between requests plus adaptive backoff on 429/5xx.
const REQUEST_DELAY_MIN_MS = 120;
const REQUEST_DELAY_MAX_MS = 240;
const MAX_RETRIES = 3;

/** Shutterstock returned no data — usually the user is not logged in. */
export class ShutterstockAuthError extends Error {
  constructor() {
    super(
      'Shutterstock returned no data: not logged in at submit.shutterstock.com?'
    );
    this.name = 'ShutterstockAuthError';
  }
}

export class ShutterstockHttpError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`Shutterstock responded with ${status} to ${path}`);
    this.name = 'ShutterstockHttpError';
    this.status = status;
  }
}

/** A response did not look as expected: Shutterstock probably changed it. */
export class ShutterstockFormatError extends Error {
  constructor(what: string) {
    super(`Unexpected Shutterstock response: ${what}`);
    this.name = 'ShutterstockFormatError';
  }
}

export const isExtensionContext = (): boolean =>
  typeof chrome !== 'undefined' && !!chrome.scripting;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pause = (extraMs = 0) =>
  sleep(
    REQUEST_DELAY_MIN_MS +
      Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS) +
      extraMs
  );

const waitForTabLoad = (tabId: number) =>
  new Promise<void>((resolve) => {
    const listener = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

export type ShutterstockSession = {
  getJson: <T>(path: string) => Promise<T>;
  close: () => Promise<void>;
};

/** Login/SSO pages: Shutterstock redirects there when the session expired. */
const isLoginUrl = (url: string) =>
  /accounts\.shutterstock\.com|\/login\b|\/auth\b|\/sign-in\b/i.test(url);

/**
 * Finds an open `submit.shutterstock.com` tab (or opens `/en/dashboard` in
 * the background) and returns a session for loading `/api/next/...` JSON.
 */
export const openShutterstockSession =
  async (): Promise<ShutterstockSession> => {
    const existing = await chrome.tabs.query({
      url: `${SHUTTERSTOCK_ORIGIN}/*`,
    });
    const usable = existing.find(
      (t) =>
        t.status === 'complete' &&
        t.id !== undefined &&
        t.url &&
        !isLoginUrl(t.url)
    );
    let tabId = usable?.id;
    let createdTab = false;

    if (tabId === undefined) {
      const tab = await chrome.tabs.create({
        url: `${SHUTTERSTOCK_ORIGIN}${SHUTTERSTOCK_TAB_PATH}`,
        active: false,
      });
      tabId = tab.id!;
      createdTab = true;
      await waitForTabLoad(tabId);
      const loaded = await chrome.tabs.get(tabId);
      if (
        !loaded.url?.startsWith(`${SHUTTERSTOCK_ORIGIN}/`) ||
        isLoginUrl(loaded.url)
      ) {
        await chrome.tabs.remove(tabId);
        throw new ShutterstockAuthError();
      }
    }

    const targetTabId = tabId;
    // Serialize execution slightly via a tail-promise lock? Actually callers can
    // run with small concurrency; we track backoff globally per session.
    let cooldownUntil = 0;

    const executeFetch = async (path: string) => {
      const now = Date.now();
      if (cooldownUntil > now) await sleep(cooldownUntil - now);

      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        world: 'MAIN',
        args: [path],
        // Runs inside the submit.shutterstock.com page: must be self-contained.
        func: async (url: string) => {
          const res = await fetch(url, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          });
          return {
            status: res.status,
            url: res.url,
            retryAfter: res.headers.get('retry-after'),
            text: await res.text(),
          };
        },
      });
      return injection?.result;
    };

    const getJson = async <T>(path: string): Promise<T> => {
      for (let attempt = 0; ; attempt++) {
        const result = await executeFetch(path);
        if (!result || result.status === 401 || result.status === 403) {
          throw new ShutterstockAuthError();
        }
        if (isLoginUrl(result.url)) throw new ShutterstockAuthError();

        if (
          (result.status === 429 || result.status >= 500) &&
          attempt < MAX_RETRIES
        ) {
          const retrySec = Number(result.retryAfter);
          const waitMs =
            Number.isFinite(retrySec) && retrySec > 0
              ? retrySec * 1000
              : 1500 * 2 ** attempt;
          cooldownUntil = Math.max(cooldownUntil, Date.now() + waitMs);
          await sleep(waitMs);
          continue;
        }

        if (result.status >= 400) {
          throw new ShutterstockHttpError(result.status, path);
        }

        await pause();

        try {
          return JSON.parse(result.text) as T;
        } catch {
          // A redirect to an HTML login or challenge page comes back as HTML.
          throw new ShutterstockAuthError();
        }
      }
    };

    const close = async () => {
      if (createdTab) await chrome.tabs.remove(targetTabId);
    };

    return { getJson, close };
  };
