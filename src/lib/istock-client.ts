/**
 * Calls Getty Images Account Management (`accountmanagement.gettyimages.com`)
 * and ESP (`esp.gettyimages.com`) from inside open tabs (`world: 'MAIN'`), so
 * requests carry the contributor's existing login session, cookies and
 * anti-forgery tokens.
 */

import { MAX_RETRIES, pause, sleep } from './request-pacing';

export const GETTY_ACCOUNT_ORIGIN = 'https://accountmanagement.gettyimages.com';
const GETTY_ACCOUNT_TAB_PATH = '/Reports/Export';

export const ESP_ORIGIN = 'https://esp.gettyimages.com';
const ESP_TAB_PATH = '/contribute/stats';

export type IstockAuthSource = 'accountmanagement' | 'esp';

export class IstockAuthError extends Error {
  readonly source: IstockAuthSource;

  constructor(source: IstockAuthSource) {
    super(
      source === 'accountmanagement'
        ? 'Getty Account Management returned no data: not logged in at accountmanagement.gettyimages.com?'
        : 'Getty ESP returned no data: not logged in at esp.gettyimages.com?'
    );
    this.name = 'IstockAuthError';
    this.source = source;
  }
}

export class IstockHttpError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`iStock/Getty responded with ${status} to ${path}`);
    this.name = 'IstockHttpError';
    this.status = status;
  }
}

export class IstockFormatError extends Error {
  constructor(what: string) {
    super(`Unexpected iStock/Getty response: ${what}`);
    this.name = 'IstockFormatError';
  }
}

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

const isLoginUrl = (url: string) =>
  /login\.gettyimages\.com|signin|sign-in|\/login\b|\/auth\b|\/Account\/LogOn/i.test(
    url
  );

type TabHandle = {
  tabId: number;
  created: boolean;
};

const openOrReuseTab = async (
  origin: string,
  path: string,
  source: IstockAuthSource
): Promise<TabHandle> => {
  const existing = await chrome.tabs.query({ url: `${origin}/*` });
  const usable = existing.find(
    (t) =>
      t.status === 'complete' &&
      t.id !== undefined &&
      t.url &&
      !isLoginUrl(t.url)
  );
  if (usable?.id !== undefined) {
    return { tabId: usable.id, created: false };
  }

  const tab = await chrome.tabs.create({
    url: `${origin}${path}`,
    active: false,
  });
  const tabId = tab.id!;
  await waitForTabLoad(tabId);
  const loaded = await chrome.tabs.get(tabId);
  if (!loaded.url?.startsWith(`${origin}/`) || isLoginUrl(loaded.url)) {
    await chrome.tabs.remove(tabId);
    throw new IstockAuthError(source);
  }
  return { tabId, created: true };
};

export type IstockSession = {
  getAccountJson: <T>(path: string) => Promise<T>;
  postAccountFormText: (
    path: string,
    form: Record<string, string>
  ) => Promise<string>;
  getEspJson: <T>(path: string) => Promise<T>;
  close: () => Promise<void>;
};

export const openIstockSession = async (): Promise<IstockSession> => {
  const accountTab = await openOrReuseTab(
    GETTY_ACCOUNT_ORIGIN,
    GETTY_ACCOUNT_TAB_PATH,
    'accountmanagement'
  );
  let espTab: TabHandle;
  try {
    espTab = await openOrReuseTab(ESP_ORIGIN, ESP_TAB_PATH, 'esp');
  } catch (err) {
    if (accountTab.created) await chrome.tabs.remove(accountTab.tabId);
    throw err;
  }

  let cooldownUntil = 0;

  const executeGet = async (tabId: number, path: string, accept: string) => {
    const now = Date.now();
    if (cooldownUntil > now) await sleep(cooldownUntil - now);

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [path, accept],
      // Self-contained inside the target origin tab.
      func: async (url: string, acceptHeader: string) => {
        const res = await fetch(url, {
          credentials: 'same-origin',
          headers: {
            accept: acceptHeader,
            'x-requested-with': 'XMLHttpRequest',
          },
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

  const executeAccountPostForm = async (
    path: string,
    form: Record<string, string>
  ) => {
    const now = Date.now();
    if (cooldownUntil > now) await sleep(cooldownUntil - now);

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: accountTab.tabId },
      world: 'MAIN',
      args: [path, form],
      // Self-contained inside accountmanagement.gettyimages.com.
      func: async (url: string, fields: Record<string, string>) => {
        const tokenInput = document.querySelector(
          'input[name="__RequestVerificationToken"]'
        );
        const token = tokenInput?.getAttribute('value') ?? '';
        const params = new URLSearchParams(fields);
        if (token && !params.has('__RequestVerificationToken')) {
          params.set('__RequestVerificationToken', token);
        }
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          },
          body: params.toString(),
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

  const runWithRetry = async (
    source: IstockAuthSource,
    path: string,
    exec: () => Promise<
      | { status: number; url: string; retryAfter: string | null; text: string }
      | undefined
    >
  ): Promise<string> => {
    for (let attempt = 0; ; attempt++) {
      const result = await exec();
      if (!result || result.status === 401 || result.status === 403) {
        throw new IstockAuthError(source);
      }
      if (isLoginUrl(result.url)) throw new IstockAuthError(source);

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
        throw new IstockHttpError(result.status, path);
      }

      await pause();
      return result.text;
    }
  };

  const parseJson = <T>(text: string, source: IstockAuthSource): T => {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new IstockAuthError(source);
    }
  };

  const getAccountJson = async <T>(path: string): Promise<T> => {
    const text = await runWithRetry('accountmanagement', path, () =>
      executeGet(accountTab.tabId, path, 'application/json')
    );
    return parseJson<T>(text, 'accountmanagement');
  };

  const postAccountFormText = async (
    path: string,
    form: Record<string, string>
  ): Promise<string> =>
    runWithRetry('accountmanagement', path, () =>
      executeAccountPostForm(path, form)
    );

  const getEspJson = async <T>(path: string): Promise<T> => {
    const text = await runWithRetry('esp', path, () =>
      executeGet(espTab.tabId, path, 'application/json')
    );
    return parseJson<T>(text, 'esp');
  };

  const close = async () => {
    const tasks: Promise<void>[] = [];
    if (accountTab.created) tasks.push(chrome.tabs.remove(accountTab.tabId));
    if (espTab.created) tasks.push(chrome.tabs.remove(espTab.tabId));
    await Promise.all(tasks);
  };

  return { getAccountJson, postAccountFormText, getEspJson, close };
};
