import {
  type Dataset,
  type HiddenChartYears,
  type ManualShoot,
  type ShootMerges,
  type ShootNames,
  STOCK_IDS,
  type StockId,
  type SyncCache,
} from '@/types/stock';

const stockKey = (stock: StockId, name: string) => `${stock}:${name}`;

const DATASET_BASE = 'dataset';
const MANUAL_SHOOTS_BASE = 'manualShoots';
const SHOOT_MERGES_BASE = 'shootMerges';
const SHOOT_NAMES_BASE = 'shootNames';
const HIDDEN_CHART_YEARS_BASE = 'hiddenChartYears';
const SYNC_CACHE_BASE = 'syncCache';

// Outside the extension (plain `npm run dev`) chrome.storage is unavailable,
// so fall back to localStorage to keep the UI usable while developing.
const hasChromeStorage = () =>
  typeof chrome !== 'undefined' && !!chrome.storage?.local;

const readRaw = async <T>(key: string): Promise<T | null> => {
  if (hasChromeStorage()) {
    const stored = await chrome.storage.local.get(key);
    return (stored[key] as T | undefined) ?? null;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeRaw = async (key: string, value: unknown): Promise<void> => {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  localStorage.setItem(key, JSON.stringify(value));
};

const removeRaw = async (keys: string[]): Promise<void> => {
  if (hasChromeStorage()) {
    await chrome.storage.local.remove(keys);
  }
  try {
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // Storage unavailable.
  }
};

/**
 * Reads a stock-scoped value. For Shutterstock, seamlessly falls back to the
 * legacy unprefixed key so existing data saved before multi-stock support is kept.
 */
const read = async <T>(
  stock: StockId | 'all',
  base: string
): Promise<T | null> => {
  const scoped = await readRaw<T>(`${stock}:${base}`);
  if (scoped !== null || stock !== 'shutterstock') return scoped;
  return readRaw<T>(base);
};

const write = (stock: StockId | 'all', base: string, value: unknown) =>
  writeRaw(`${stock}:${base}`, value);

export const loadDataset = (stock: StockId = 'shutterstock') =>
  read<Dataset>(stock, DATASET_BASE);

export const saveDataset = (
  dataset: Dataset,
  stock: StockId = 'shutterstock'
) => write(stock, DATASET_BASE, dataset);

export const loadManualShoots = async (stock: StockId = 'shutterstock') =>
  (await read<ManualShoot[]>(stock, MANUAL_SHOOTS_BASE)) ?? [];

export const saveManualShoots = (
  shoots: ManualShoot[],
  stock: StockId = 'shutterstock'
) => write(stock, MANUAL_SHOOTS_BASE, shoots);

export const loadShootMerges = async (stock: StockId = 'shutterstock') =>
  (await read<ShootMerges>(stock, SHOOT_MERGES_BASE)) ?? {};

export const saveShootMerges = (
  merges: ShootMerges,
  stock: StockId = 'shutterstock'
) => write(stock, SHOOT_MERGES_BASE, merges);

export const loadShootNames = async (stock: StockId = 'shutterstock') =>
  (await read<ShootNames>(stock, SHOOT_NAMES_BASE)) ?? {};

export const saveShootNames = (
  names: ShootNames,
  stock: StockId = 'shutterstock'
) => write(stock, SHOOT_NAMES_BASE, names);

export const loadHiddenChartYears = async (
  stock: StockId | 'all' = 'shutterstock'
) => (await read<HiddenChartYears>(stock, HIDDEN_CHART_YEARS_BASE)) ?? {};

export const saveHiddenChartYears = (
  hidden: HiddenChartYears,
  stock: StockId | 'all' = 'shutterstock'
) => write(stock, HIDDEN_CHART_YEARS_BASE, hidden);

export const loadSyncCache = async (
  stock: StockId = 'shutterstock'
): Promise<SyncCache> => {
  const stored = await read<SyncCache>(stock, SYNC_CACHE_BASE);
  if (stored?.version === 1 && stored.months) return stored;
  return { version: 1, months: {} };
};

export const saveSyncCache = (
  cache: SyncCache,
  stock: StockId = 'shutterstock'
) => write(stock, SYNC_CACHE_BASE, cache);

export const loadAllDatasets = async (): Promise<
  Partial<Record<StockId, Dataset>>
> => {
  const entries = await Promise.all(
    STOCK_IDS.map(async (id) => [id, await loadDataset(id)] as const)
  );
  const result: Partial<Record<StockId, Dataset>> = {};
  for (const [id, data] of entries) {
    if (data) result[id] = data;
  }
  return result;
};

/** Removes all stored data for a single microstock. */
export const clearStockData = async (stock: StockId): Promise<void> => {
  const bases = [
    DATASET_BASE,
    MANUAL_SHOOTS_BASE,
    SHOOT_MERGES_BASE,
    SHOOT_NAMES_BASE,
    HIDDEN_CHART_YEARS_BASE,
    SYNC_CACHE_BASE,
  ];
  const keys = bases.map((b) => stockKey(stock, b));
  if (stock === 'shutterstock') keys.push(...bases);
  await removeRaw(keys);
};

/**
 * Removes everything the extension keeps in this browser across all
 * microstocks: synced data, cache, own shoots, renames, joins, hidden chart
 * years, and the theme / language choice.
 */
export const clearAllData = async (): Promise<void> => {
  if (hasChromeStorage()) await chrome.storage.local.clear();
  try {
    localStorage.clear();
  } catch {
    // Nothing stored there, or storage unavailable.
  }
};
