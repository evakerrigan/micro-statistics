import type { MessageKey, Translate } from '@/lib/i18n';
import {
  type Dataset,
  type ManualShoot,
  type ShootMerges,
  type ShootNames,
  STOCK_IDS,
  type StockId,
} from '@/types/stock';
import {
  buildStats,
  type LicenseTotals,
  type MonthStat,
  type PhotoStat,
  type ShootStat,
  type Stats,
} from './aggregate';
import { shootTitle } from './shoot-labels';

export const STOCK_NAME_KEYS: Record<StockId, MessageKey> = {
  adobe: 'stock.adobe',
  shutterstock: 'stock.shutterstock',
  istock: 'stock.istock',
};

export type StockEntry = {
  stock: StockId;
  dataset: Dataset;
  stats: Stats;
};

export type CombinedStats = {
  entries: StockEntry[];
  activeStocks: StockId[];
  revenue: number;
  salesCount: number;
  soldPhotos: number;
  publishedPhotos: number;
  photoCount: number;
  videoCount: number;
  shootsCount: number;
  revenuePerSoldPhoto: number | null;
  revenuePerPortfolioPhoto: number | null;
  licenses: string[];
  assetLicenses: string[];
  byLicense: LicenseTotals;
  months: MonthStat[];
  portfolioDates: string[];
  photos: PhotoStat[];
  shoots: ShootStat[];
};

const round = (n: number) => Math.round(n * 10000) / 10000;

export const combineAllStats = (
  datasets: Partial<Record<StockId, Dataset>>,
  manualByStock: Partial<Record<StockId, ManualShoot[]>>,
  mergesByStock: Partial<Record<StockId, ShootMerges>>,
  namesByStock: Partial<Record<StockId, ShootNames>>,
  t: Translate
): CombinedStats => {
  const entries: StockEntry[] = [];
  for (const stock of STOCK_IDS) {
    const dataset = datasets[stock];
    if (!dataset) continue;
    entries.push({
      stock,
      dataset,
      stats: buildStats(
        dataset,
        manualByStock[stock] ?? [],
        mergesByStock[stock] ?? {},
        namesByStock[stock] ?? {}
      ),
    });
  }

  const byLicense: LicenseTotals = {};
  const assetLicenseTotals: LicenseTotals = {};
  const monthMap = new Map<string, MonthStat>();
  const allPhotos: PhotoStat[] = [];
  const allShoots: ShootStat[] = [];
  const portfolioDates: string[] = [];

  let revenue = 0;
  let salesCount = 0;
  let soldPhotos = 0;
  let publishedPhotos = 0;
  let photoCount = 0;
  let videoCount = 0;
  let shootsCount = 0;

  for (const { stock, stats } of entries) {
    const stockName = t(STOCK_NAME_KEYS[stock]);
    revenue = round(revenue + stats.revenue);
    salesCount += stats.salesCount;
    soldPhotos += stats.soldPhotos;
    publishedPhotos += stats.publishedPhotos;
    photoCount += stats.photoCount;
    videoCount += stats.videoCount;
    shootsCount += stats.shoots.filter((s) => s.kind !== 'unmatched').length;
    portfolioDates.push(...stats.portfolioDates);

    for (const m of stats.months) {
      const existing = monthMap.get(m.key) ?? {
        key: m.key,
        revenue: 0,
        salesCount: 0,
        byLicense: {},
      };
      existing.revenue = round(existing.revenue + m.revenue);
      existing.salesCount += m.salesCount;
      existing.byLicense[stock] = round(
        (existing.byLicense[stock] ?? 0) + m.revenue
      );
      monthMap.set(m.key, existing);

      for (const [lic, amount] of Object.entries(m.byLicense)) {
        byLicense[lic] = round((byLicense[lic] ?? 0) + amount);
      }
    }

    const shootTitleByKey = new Map<string, string>();
    for (const shoot of stats.shoots) {
      const prefixedKey = `${stock}:${shoot.key}`;
      const label =
        shoot.kind === 'unmatched'
          ? stockName
          : `${stockName} · ${shootTitle(shoot, t)}`;
      shootTitleByKey.set(shoot.key, label);
      allShoots.push({
        ...shoot,
        key: prefixedKey,
        customTitle: label,
        title: label,
      });
    }

    for (const p of stats.photos) {
      for (const [lic, amount] of Object.entries(p.byLicense)) {
        assetLicenseTotals[lic] = round(
          (assetLicenseTotals[lic] ?? 0) + amount
        );
      }
      allPhotos.push({
        ...p,
        uid: `${stock}:${p.product.id}`,
        shootKey: p.shootKey ? `${stock}:${p.shootKey}` : `${stock}:unmatched`,
      });
    }

    // Ensure an unmatched bucket shoot exists if any sold photo had no shootKey.
    if (
      stats.photos.some((p) => !p.shootKey) &&
      !shootTitleByKey.has('unmatched')
    ) {
      allShoots.push({
        key: `${stock}:unmatched`,
        kind: 'unmatched',
        manualId: null,
        title: stockName,
        customTitle: stockName,
        uploadedAt: null,
        publishedAt: null,
        publishedCount: null,
        thumbUrl: null,
        photos: [],
        unsoldPhotos: [],
        salesCount: 0,
        revenue: 0,
        revenuePerPhoto: null,
        lastSale: null,
        byLicense: {},
        mergedFrom: [],
      });
    }
  }

  allPhotos.sort((a, b) => b.revenue - a.revenue);
  portfolioDates.sort();
  const months = [...monthMap.values()].sort((a, b) =>
    a.key.localeCompare(b.key)
  );
  const activeStocks = entries
    .slice()
    .sort((a, b) => b.stats.revenue - a.stats.revenue)
    .map((e) => e.stock);

  return {
    entries,
    activeStocks,
    revenue,
    salesCount,
    soldPhotos,
    publishedPhotos,
    photoCount,
    videoCount,
    shootsCount,
    revenuePerSoldPhoto: soldPhotos ? round(revenue / soldPhotos) : null,
    revenuePerPortfolioPhoto: publishedPhotos
      ? round(revenue / publishedPhotos)
      : null,
    licenses: Object.keys(byLicense).sort(
      (a, b) => byLicense[b] - byLicense[a]
    ),
    assetLicenses: Object.keys(assetLicenseTotals).sort(
      (a, b) => assetLicenseTotals[b] - assetLicenseTotals[a]
    ),
    byLicense,
    months,
    portfolioDates,
    photos: allPhotos,
    shoots: allShoots,
  };
};
