import { openShutterstockSession } from '@/lib/shutterstock-client';
import { loadSyncCache, saveSyncCache } from '@/lib/storage';
import type {
  CachedAssetSale,
  CachedDaySales,
  Dataset,
  MediaKind,
  PortfolioItem,
  Product,
  Sale,
  Shoot,
  SyncCache,
} from '@/types/shutterstock';
import {
  type AggregateDay,
  type AssetLicense,
  assetPublicUrl,
  fetchCurrentUser,
  fetchDayMediaStats,
  fetchEarningsGraph,
  fetchEarningsSummary,
  fetchMediaSummary,
  fetchMonthAggregate,
  fetchPortfolioPage,
  type GraphMonth,
  isAssetLicense,
  isReferralLicense,
  PORTFOLIO_PAGE_SIZE,
  roundMoney,
} from './api/shutterstock-api';

export type SyncStep = 'connect' | 'portfolio' | 'months' | 'sales';

export type SyncProgress = {
  step: SyncStep;
  done: number;
  total: number;
};

type OnProgress = (progress: SyncProgress) => void;

const MAX_PORTFOLIO_PAGES = 500;
const CONCURRENCY = 1;
const CHECKPOINT_EVERY = 25;

const monthKeyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const addDaysIso = (d: Date, delta: number) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + delta);
  return copy.toISOString().slice(0, 10);
};

/** Runs async work over `items` with bounded concurrency. */
const runPool = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) => {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    }
  );
  await Promise.all(runners);
};

const fetchMediaPortfolio = async (
  session: Awaited<ReturnType<typeof openShutterstockSession>>,
  mediaType: MediaKind,
  expectedTotal: number,
  onPageDone: (totalKnownPages: number) => void
): Promise<PortfolioItem[]> => {
  if (expectedTotal === 0) return [];
  const byId = new Map<string, PortfolioItem>();
  const first = await fetchPortfolioPage(session, mediaType, 1);
  for (const item of first.items) byId.set(item.id, item);

  const total = first.total ?? expectedTotal;
  const pageCount = Math.min(
    MAX_PORTFOLIO_PAGES,
    Math.max(1, Math.ceil(total / PORTFOLIO_PAGE_SIZE))
  );
  onPageDone(pageCount);

  if (pageCount > 1 && first.items.length > 0) {
    const pages = Array.from({ length: pageCount - 1 }, (_, i) => i + 2);
    await runPool(pages, 2, async (page) => {
      const res = await fetchPortfolioPage(session, mediaType, page);
      for (const item of res.items) byId.set(item.id, item);
      onPageDone(pageCount);
    });
  }
  return [...byId.values()];
};

const fetchFullPortfolio = async (
  session: Awaited<ReturnType<typeof openShutterstockSession>>,
  photoExpected: number,
  videoExpected: number,
  onProgress: OnProgress
): Promise<PortfolioItem[]> => {
  let done = 0;
  let photoPages = Math.max(1, Math.ceil(photoExpected / PORTFOLIO_PAGE_SIZE));
  let videoPages =
    videoExpected > 0
      ? Math.max(1, Math.ceil(videoExpected / PORTFOLIO_PAGE_SIZE))
      : 0;
  onProgress({ step: 'portfolio', done: 0, total: photoPages + videoPages });

  const photos = await fetchMediaPortfolio(
    session,
    'photo',
    Math.max(1, photoExpected),
    (actualPages) => {
      photoPages = actualPages;
      done += 1;
      onProgress({
        step: 'portfolio',
        done,
        total: Math.max(done, photoPages + videoPages),
      });
    }
  );
  const videos = await fetchMediaPortfolio(
    session,
    'video',
    videoExpected,
    (actualPages) => {
      videoPages = actualPages;
      done += 1;
      onProgress({
        step: 'portfolio',
        done,
        total: Math.max(done, photoPages + videoPages),
      });
    }
  );

  const merged = new Map<string, PortfolioItem>();
  for (const item of [...photos, ...videos]) merged.set(item.id, item);
  return [...merged.values()];
};

/**
 * Collects the user's Shutterstock portfolio (photos + videos) and full
 * daily/monthly sales history using incremental caching in `syncCache`.
 */
export const collectDataset = async (
  onProgress: OnProgress,
  _previous: Dataset | null
): Promise<Dataset> => {
  void _previous;
  onProgress({ step: 'connect', done: 0, total: 1 });
  const session = await openShutterstockSession();
  const cache: SyncCache = await loadSyncCache('shutterstock');
  let cacheDirty = false;

  try {
    const now = new Date();
    const user = await fetchCurrentUser(session);
    const summary = await fetchEarningsSummary(session);
    const mediaSummary = await fetchMediaSummary(session);
    const graphMonths = await fetchEarningsGraph(session, user.createTime, now);

    const portfolio = await fetchFullPortfolio(
      session,
      mediaSummary.photoCount,
      mediaSummary.videoCount,
      onProgress
    );

    const currentMonth = monthKeyOf(now);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonth = monthKeyOf(prevDate);
    const recentCutoff = addDaysIso(now, -3);

    const activeMonths: GraphMonth[] = graphMonths.filter(
      (m) => m.total !== 0 || m.count > 0 || m.countWithReferrals > 0
    );
    if (!activeMonths.some((m) => m.month === currentMonth)) {
      activeMonths.push({
        month: currentMonth,
        total: 0,
        count: 0,
        countWithReferrals: 0,
        categories: [],
        signature: 'current',
      });
    }

    // 1. Fetch daily aggregates only for open or changed months.
    const monthsToFetch = activeMonths.filter((m) => {
      const isOpen = m.month >= previousMonth;
      const cached = cache.months[m.month];
      return isOpen || !cached || cached.signature !== m.signature;
    });

    const fetchedAggregates = new Map<string, AggregateDay[]>();
    if (monthsToFetch.length > 0) {
      let monthsDone = 0;
      onProgress({ step: 'months', done: 0, total: monthsToFetch.length });
      await runPool(monthsToFetch, CONCURRENCY, async (gm) => {
        const [year, month] = gm.month.split('-').map(Number);
        const days = await fetchMonthAggregate(session, year, month);
        fetchedAggregates.set(gm.month, days);
        monthsDone += 1;
        onProgress({
          step: 'months',
          done: monthsDone,
          total: monthsToFetch.length,
        });
      });
    }

    // 2. Determine which individual days need `media_stats/day` calls.
    type DayJob = {
      monthKey: string;
      day: AggregateDay;
    };
    const dayJobs: DayJob[] = [];
    const pendingPerMonth = new Map<string, number>();

    for (const gm of activeMonths) {
      const days = fetchedAggregates.get(gm.month);
      if (!days) continue;
      const existingDays = cache.months[gm.month]?.days ?? {};
      const nextDays: Record<string, CachedDaySales> = {};
      let pending = 0;

      for (const day of days) {
        const cached = existingDays[day.date];
        const isRecent = day.date >= recentCutoff;
        const cacheMatches =
          cached &&
          !isRecent &&
          cached.earnings === day.earnings &&
          cached.downloads === day.downloads &&
          cached.assetKey === day.assetKey;

        if (cacheMatches) {
          nextDays[day.date] = cached;
        } else if (!day.assetKey) {
          nextDays[day.date] = buildNonAssetDayCache(day);
          cacheDirty = true;
        } else {
          // Preserve any partial prior day while pending, and keep signature
          // empty until every pending day in this month finishes.
          if (cached) nextDays[day.date] = cached;
          dayJobs.push({ monthKey: gm.month, day });
          pending += 1;
        }
      }

      // Safety net if `graph` reports earnings for a month whose `aggregate`
      // omitted a non-asset category (e.g., referrals on an older month).
      const daysSum = days.reduce(
        (sum, d) => sum + d.categories.reduce((s, c) => s + c.earnings, 0),
        0
      );
      const monthDiff = roundMoney(gm.total - daysSum);
      if (Math.abs(monthDiff) >= 0.005) {
        const fallbackDate = `${gm.month}-01`;
        const missingLicense = findMissingGraphLicense(gm, days) ?? null;
        const base = nextDays[fallbackDate] ?? {
          earnings: 0,
          downloads: 0,
          assetKey: '',
          assetRows: [],
          otherRows: [],
        };
        nextDays[fallbackDate] = {
          ...base,
          otherRows: [
            ...base.otherRows,
            {
              date: fallbackDate,
              amount: monthDiff,
              count: 0,
              license: missingLicense,
            },
          ],
        };
      }

      pendingPerMonth.set(gm.month, pending);
      cache.months[gm.month] = {
        month: gm.month,
        // Stamp signature immediately only when there are no pending day jobs;
        // otherwise stamp it once the last pending day of the month completes.
        signature: pending === 0 ? gm.signature : '',
        days: nextDays,
      };
      cacheDirty = true;
    }

    if (dayJobs.length > 0) {
      const graphByMonth = new Map(activeMonths.map((m) => [m.month, m]));
      let daysDone = 0;
      onProgress({ step: 'sales', done: 0, total: dayJobs.length });
      await runPool(dayJobs, CONCURRENCY, async ({ monthKey, day }) => {
        const dayEntry = await fetchAndReconcileDay(session, day);
        const monthEntry = cache.months[monthKey];
        const prevOther =
          monthEntry.days[day.date]?.otherRows.filter(
            (r) => r.license === 'referrals' || !isAssetLicense(r.license ?? '')
          ) ?? [];
        // Keep month-level synthetic residual on `-01` if we injected one above.
        const keepMonthResidual =
          day.date.endsWith('-01') &&
          prevOther.length > 0 &&
          !dayEntry.otherRows.length
            ? prevOther.filter(
                (r) => !day.categories.some((c) => c.license === r.license)
              )
            : [];
        monthEntry.days[day.date] = {
          ...dayEntry,
          otherRows: [...dayEntry.otherRows, ...keepMonthResidual],
        };
        const left = (pendingPerMonth.get(monthKey) ?? 1) - 1;
        pendingPerMonth.set(monthKey, left);
        if (left === 0) {
          monthEntry.signature = graphByMonth.get(monthKey)?.signature ?? '';
        }
        cacheDirty = true;
        daysDone += 1;
        onProgress({ step: 'sales', done: daysDone, total: dayJobs.length });
        if (daysDone % CHECKPOINT_EVERY === 0) {
          await saveSyncCache(cache, 'shutterstock');
        }
      });
    }

    if (cacheDirty) await saveSyncCache(cache, 'shutterstock');

    return assembleDataset({
      cache,
      activeMonthKeys: activeMonths.map((m) => m.month),
      portfolio,
      shutterstockTotal: summary.total,
      shutterstockDownloads: summary.count,
      photoCount: mediaSummary.photoCount,
      videoCount: mediaSummary.videoCount,
    });
  } finally {
    if (cacheDirty) {
      try {
        await saveSyncCache(cache, 'shutterstock');
      } catch {
        // Ignore storage errors while cleaning up.
      }
    }
    await session.close();
  }
};

const findMissingGraphLicense = (
  gm: GraphMonth,
  days: AggregateDay[]
): string | null => {
  const inDays = new Set(
    days.flatMap((d) => d.categories.map((c) => c.license))
  );
  const missing = gm.categories.find(
    (c) => c.total !== 0 && c.license && !inDays.has(c.license)
  );
  return missing?.license ?? null;
};

const buildNonAssetDayCache = (day: AggregateDay): CachedDaySales => ({
  earnings: day.earnings,
  downloads: day.downloads,
  assetKey: day.assetKey,
  assetRows: [],
  otherRows: day.categories.map((c) => ({
    date: day.date,
    amount: roundMoney(c.earnings),
    count: isReferralLicense(c.rawKey) ? 0 : c.downloads,
    license: c.license,
  })),
});

const fetchAndReconcileDay = async (
  session: Awaited<ReturnType<typeof openShutterstockSession>>,
  day: AggregateDay
): Promise<CachedDaySales> => {
  const assetRows: CachedAssetSale[] = [];
  const otherRows: Sale[] = [];

  for (const cat of day.categories) {
    if (!isAssetLicense(cat.license)) {
      otherRows.push({
        date: day.date,
        amount: roundMoney(cat.earnings),
        count: isReferralLicense(cat.rawKey) ? 0 : cat.downloads,
        license: cat.license,
      });
      continue;
    }

    const rows = await fetchDayMediaStats(
      session,
      day.date,
      cat.license as AssetLicense
    );
    let fetchedEarnings = 0;
    let fetchedDownloads = 0;
    for (const r of rows) {
      fetchedEarnings += r.amount;
      fetchedDownloads += r.count;
      assetRows.push({
        mediaId: r.mediaId,
        mediaType: r.mediaType,
        date: r.date,
        amount: r.amount,
        count: r.count,
        license: r.license,
        headline: r.headline,
        thumbUrl: r.thumbUrl,
        uploadDate: r.uploadDate,
      });
    }

    const residualAmount = roundMoney(cat.earnings - fetchedEarnings);
    const residualCount = Math.max(0, cat.downloads - fetchedDownloads);
    if (Math.abs(residualAmount) >= 0.005 || residualCount > 0) {
      otherRows.push({
        date: day.date,
        amount: residualAmount,
        count: residualCount,
        license: cat.license,
      });
    }
  }

  return {
    earnings: day.earnings,
    downloads: day.downloads,
    assetKey: day.assetKey,
    assetRows,
    otherRows,
  };
};

type AssembleInput = {
  cache: SyncCache;
  activeMonthKeys: string[];
  portfolio: PortfolioItem[];
  shutterstockTotal: number;
  shutterstockDownloads: number;
  photoCount: number;
  videoCount: number;
};

export const assembleDataset = ({
  cache,
  activeMonthKeys,
  portfolio,
  shutterstockTotal,
  shutterstockDownloads,
  photoCount,
  videoCount,
}: AssembleInput): Dataset => {
  const portfolioById = new Map(portfolio.map((p) => [p.id, p]));
  const products = new Map<string, Product>();
  const otherSales: Sale[] = [];

  for (const monthKey of activeMonthKeys) {
    const month = cache.months[monthKey];
    if (!month) continue;
    for (const day of Object.values(month.days)) {
      for (const row of day.assetRows) {
        const portfolioItem = portfolioById.get(row.mediaId);
        const mediaType = portfolioItem?.mediaType ?? row.mediaType;
        const existing = products.get(row.mediaId) ?? {
          id: row.mediaId,
          mediaType,
          isIllustration: portfolioItem?.isIllustration,
          headline: portfolioItem?.headline || row.headline,
          createdAt: portfolioItem?.createdAt || row.uploadDate,
          thumbUrl: portfolioItem?.thumbUrl || row.thumbUrl,
          url: assetPublicUrl(row.mediaId, mediaType),
          sales: [],
        };
        existing.sales.push({
          date: row.date,
          amount: row.amount,
          count: row.count,
          license: row.license,
        });
        products.set(row.mediaId, existing);
      }
      for (const other of day.otherRows) {
        otherSales.push(other);
      }
    }
  }

  // Group all known assets (portfolio + sold deleted assets) by upload date.
  const shootIdsByDate = new Map<string, Set<string>>();
  const addToDate = (date: string | null, id: string) => {
    if (!date) return;
    let set = shootIdsByDate.get(date);
    if (!set) {
      set = new Set<string>();
      shootIdsByDate.set(date, set);
    }
    set.add(id);
  };

  for (const item of portfolio) addToDate(item.createdAt, item.id);
  for (const product of products.values())
    addToDate(product.createdAt, product.id);

  const shoots: Shoot[] = [...shootIdsByDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, ids]) => ({
      id: date,
      title: date,
      uploadedAt: date,
      photoIds: [...ids],
    }));

  return {
    syncedAt: new Date().toISOString(),
    shutterstockTotal,
    shutterstockDownloads,
    portfolioSize: photoCount + videoCount || portfolio.length,
    photoCount,
    videoCount,
    portfolio,
    shoots,
    products: [...products.values()],
    otherSales,
  };
};
