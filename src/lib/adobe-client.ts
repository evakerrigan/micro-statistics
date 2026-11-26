/**
 * Calls Adobe Stock Contributor's internal JSON routes from inside an open
 * `contributor.stock.adobe.com` tab (`world: 'MAIN'`), so requests carry the
 * user's existing login session, cookies and CSRF token exactly like the SPA.
 */

export const ADOBE_ORIGIN = 'https://contributor.stock.adobe.com';
const ADOBE_TAB_PATH = '/portfolio';

const REQUEST_DELAY_MIN_MS = 120;
const REQUEST_DELAY_MAX_MS = 240;
const MAX_RETRIES = 3;

export class AdobeAuthError extends Error {
  constructor() {
    super(
      'Adobe Stock returned no data: not logged in at contributor.stock.adobe.com?'
    );
    this.name = 'AdobeAuthError';
  }
}

export class AdobeHttpError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`Adobe Stock responded with ${status} to ${path}`);
    this.name = 'AdobeHttpError';
    this.status = status;
  }
}

export class AdobeFormatError extends Error {
  constructor(what: string) {
    super(`Unexpected Adobe Stock response: ${what}`);
    this.name = 'AdobeFormatError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pause = () =>
  sleep(
    REQUEST_DELAY_MIN_MS +
      Math.random() * (REQUEST_DELAY_MAX_MS - REQUEST_DELAY_MIN_MS)
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

export type AdobeSession = {
  /** Detected portal locale prefix, e.g. `ru` or `en`. */
  locale: string;
  getJson: <T>(path: string) => Promise<T>;
  close: () => Promise<void>;
};

const isLoginUrl = (url: string) =>
  /auth\.services\.adobe\.com|account\.adobe\.com|adobelogin\.com|\/login\b|\/auth\b/i.test(
    url
  );

const extractLocalePrefix = (url: string | undefined) => {
  if (!url) return 'ru';
  try {
    const match = /^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/i.exec(
      new URL(url).pathname
    );
    return match ? match[1].toLowerCase() : 'ru';
  } catch {
    return 'ru';
  }
};

/**
 * Finds an open `contributor.stock.adobe.com` tab (or opens `/portfolio` in
 * the background) and returns a session for loading SPA JSON routes.
 */
export const openAdobeSession = async (): Promise<AdobeSession> => {
  const existing = await chrome.tabs.query({
    url: `${ADOBE_ORIGIN}/*`,
  });
  const usable = existing.find(
    (t) =>
      t.status === 'complete' &&
      t.id !== undefined &&
      t.url &&
      !isLoginUrl(t.url)
  );
  let tabId = usable?.id;
  let tabUrl = usable?.url;
  let createdTab = false;

  if (tabId === undefined) {
    const tab = await chrome.tabs.create({
      url: `${ADOBE_ORIGIN}${ADOBE_TAB_PATH}`,
      active: false,
    });
    tabId = tab.id!;
    createdTab = true;
    await waitForTabLoad(tabId);
    const loaded = await chrome.tabs.get(tabId);
    tabUrl = loaded.url;
    if (!loaded.url?.startsWith(`${ADOBE_ORIGIN}/`) || isLoginUrl(loaded.url)) {
      await chrome.tabs.remove(tabId);
      throw new AdobeAuthError();
    }
  }

  const locale = extractLocalePrefix(tabUrl);
  const targetTabId = tabId;
  let cooldownUntil = 0;

  const executeFetch = async (path: string) => {
    const now = Date.now();
    if (cooldownUntil > now) await sleep(cooldownUntil - now);

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      world: 'MAIN',
      args: [path],
      // Runs inside contributor.stock.adobe.com: must be self-contained.
      func: async (url: string) => {
        const findCsrf = (): string => {
          const meta = document
            .querySelector('meta[name="csrf-token"], meta[name="_csrf"]')
            ?.getAttribute('content');
          if (meta) return meta;
          const input = document
            .querySelector('input[name="_csrf"]')
            ?.getAttribute('value');
          if (input) return input;
          const win = window as unknown as Record<string, unknown>;
          if (typeof win.csrfToken === 'string' && win.csrfToken) {
            return win.csrfToken;
          }
          for (const script of document.scripts) {
            const text = script.textContent ?? '';
            const m =
              /["']?csrf(?:Token|_?token)["']?\s*[:=]\s*["']([^"']+)["']/i.exec(
                text
              );
            if (m?.[1]) return m[1];
          }
          return '';
        };

        const csrf = findCsrf();
        const headers: Record<string, string> = {
          accept: 'application/json',
          'x-requested-with': 'XMLHttpRequest',
        };
        if (csrf) headers['csrf-token'] = csrf;

        const res = await fetch(url, {
          credentials: 'same-origin',
          headers,
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
        throw new AdobeAuthError();
      }
      if (isLoginUrl(result.url)) throw new AdobeAuthError();

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
        throw new AdobeHttpError(result.status, path);
      }

      await pause();

      try {
        return JSON.parse(result.text) as T;
      } catch {
        throw new AdobeAuthError();
      }
    }
  };

  const close = async () => {
    if (createdTab) await chrome.tabs.remove(targetTabId);
  };

  return { locale, getJson, close };
};
