import { openAdobeSession } from '@/lib/adobe-client';
import { stockAssetUrl } from '@/lib/asset-url';
import type {
  Dataset,
  PortfolioItem,
  Product,
  Sale,
  Shoot,
} from '@/types/stock';
import {
  ADOBE_PORTFOLIO_PAGE_SIZE,
  type AdobePortfolioItem,
  type AdobeSaleRow,
  type AdobeSeriesPoint,
  fetchAdobeEarningsSeries,
  fetchAdobeOtherPayments,
  fetchAdobeOverview,
  fetchAdobePortfolioPage,
  fetchAdobeSalesSeries,
  fetchAdobeSalesWindow,
  fetchAdobeTopSellerDates,
} from './api/adobe-api';
import type { SyncProgress } from './collect';

type OnProgress = (progress: SyncProgress) => void;

const MAX_PORTFOLIO_PAGES = 500;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

const yearFromText = (text: string): number | null => {
  const m = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(text);
  return m ? Number(m[1]) : null;
};

const isoDayFromSeriesKey = (key: string): string | null => {
  const day = key.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const month = key.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : null;
};

const isoToday = (d = new Date()) => d.toISOString().slice(0, 10);

const toDayMap = (points: AdobeSeriesPoint[]) => {
  const map = new Map<string, number>();
  for (const pt of points) {
    const day = isoDayFromSeriesKey(pt.key);
    if (!day) continue;
    map.set(day, (map.get(day) ?? 0) + pt.value);
  }
  return map;
};

const addMap = (map: Map<string, number>, key: string, delta: number) => {
  map.set(key, (map.get(key) ?? 0) + delta);
};

/**
 * Collects the contributor's full Adobe Stock portfolio (photos, vectors,
 * illustrations, videos), recent per-asset sales (<= 3 years), lifetime
 * daily earnings/downloads (no 3-year clamp), and Firefly/other payouts.
 */
export const collectAdobeDataset = async (
  onProgress: OnProgress
): Promise<Dataset> => {
  onProgress({ step: 'connect', done: 0, total: 1 });
  const session = await openAdobeSession();

  try {
    const now = new Date();
    const today = isoToday(now);
    const overview = await fetchAdobeOverview(session);
    const earningsSeries = await fetchAdobeEarningsSeries(
      session,
      '2000-01-01',
      today,
      'day'
    );
    const salesSeries = await fetchAdobeSalesSeries(
      session,
      '2000-01-01',
      today,
      'day'
    );

    // 1. Portfolio (photos + illustrations + vectors + videos)
    const byId = new Map<string, AdobePortfolioItem>();
    onProgress({ step: 'portfolio', done: 0, total: 1 });
    for (let page = 1; page <= MAX_PORTFOLIO_PAGES; page++) {
      const res = await fetchAdobePortfolioPage(session, page);
      const before = byId.size;
      for (const item of res.items) byId.set(item.id, item);
      onProgress({
        step: 'portfolio',
        done: page,
        total: page + (res.rawCount >= ADOBE_PORTFOLIO_PAGE_SIZE ? 1 : 0),
      });
      if (res.rawCount < ADOBE_PORTFOLIO_PAGE_SIZE || byId.size === before) {
        break;
      }
    }
    const portfolioWithStats = [...byId.values()];

    // Determine earliest active year from daily series + oldest portfolio item.
    const seriesYears = [...earningsSeries.points, ...salesSeries.points]
      .filter((p) => p.value !== 0)
      .map((p) => yearFromText(p.key))
      .filter((y): y is number => y !== null);
    const portfolioYears = portfolioWithStats
      .map((p) => (p.createdAt ? Number(p.createdAt.slice(0, 4)) : null))
      .filter((y): y is number => y !== null && Number.isFinite(y));
    const startYear = Math.min(
      now.getFullYear(),
      ...(seriesYears.length ? seriesYears : [now.getFullYear()]),
      ...(portfolioYears.length ? portfolioYears : [now.getFullYear()])
    );

    // 2. Per-asset sales history (single query — Adobe clamps start_date to
    //    the last 3 years and ignores end_date, so multi-window queries would
    //    return duplicate rows).
    onProgress({ step: 'sales', done: 0, total: 1 });
    const salesRes = await fetchAdobeSalesWindow(
      session,
      `${startYear}-01-01`,
      today,
      (done, total) => onProgress({ step: 'sales', done, total })
    );
    const allRows: AdobeSaleRow[] = salesRes.rows;

    // 3. Other payments (Firefly Contributor Bonus, etc.)
    const otherPayments = await fetchAdobeOtherPayments(
      session,
      `${startYear}-01-01`,
      today
    );

    // 4. Optional fallback: try to recover creationDate for deleted sold assets.
    const portfolioById = new Map(portfolioWithStats.map((p) => [p.id, p]));
    const hasMissingDates = allRows.some((r) => !portfolioById.has(r.mediaId));
    let topSellerDates = new Map<string, string>();
    if (hasMissingDates) {
      try {
        const threeYearsAgo = `${now.getFullYear() - 2}-01-01`;
        topSellerDates = await fetchAdobeTopSellerDates(
          session,
          threeYearsAgo,
          today
        );
      } catch {
        // Non-critical fallback; assets without dates still appear under "No shoot".
      }
    }

    // 5. Assemble normalized products (recent detailed sales + portfolio items
    //    whose catalog `nb_downloads` shows sales older than 3 years).
    const products = new Map<string, Product>();
    for (const row of allRows) {
      const portfolioItem = portfolioById.get(row.mediaId);
      const mediaType = portfolioItem?.mediaType ?? row.mediaType;
      const existing = products.get(row.mediaId) ?? {
        id: row.mediaId,
        mediaType,
        isIllustration: portfolioItem?.isIllustration ?? row.isIllustration,
        headline: portfolioItem?.headline || row.headline,
        createdAt:
          portfolioItem?.createdAt ?? topSellerDates.get(row.mediaId) ?? null,
        thumbUrl: portfolioItem?.thumbUrl || row.thumbUrl,
        url: stockAssetUrl('adobe', row.mediaId, mediaType),
        sales: [],
      };
      existing.sales.push({
        date: row.date,
        amount: row.amount,
        count: 1,
        license: row.license,
      });
      products.set(row.mediaId, existing);
    }

    for (const item of portfolioWithStats) {
      if (item.nbDownloads <= 0) continue;
      const existing = products.get(item.id);
      if (existing) {
        existing.lifetimeDownloads = Math.max(
          item.nbDownloads,
          existing.sales.length
        );
      } else {
        products.set(item.id, {
          id: item.id,
          mediaType: item.mediaType,
          isIllustration: item.isIllustration,
          headline: item.headline,
          createdAt: item.createdAt,
          thumbUrl: item.thumbUrl,
          url: stockAssetUrl('adobe', item.id, item.mediaType),
          sales: [],
          lifetimeDownloads: item.nbDownloads,
        });
      }
    }

    // 6. Reconcile daily earnings & downloads not covered by the 3-year
    //    `sales-earnings` window (and `other-payments`) using the unclamped
    //    `insights/earnings` and `insights/sales` daily series.
    const dailyEarnings = toDayMap(earningsSeries.points);
    const dailyDownloads = toDayMap(salesSeries.points);
    const detailEarningsByDay = new Map<string, number>();
    const detailDownloadsByDay = new Map<string, number>();
    for (const row of allRows) {
      addMap(detailEarningsByDay, row.date, row.amount);
      addMap(detailDownloadsByDay, row.date, 1);
    }
    const otherEarningsByDay = new Map<string, number>();
    for (const s of otherPayments) {
      addMap(otherEarningsByDay, s.date, s.amount);
    }

    const otherSales: Sale[] = [...otherPayments];
    const allDays = new Set([
      ...dailyEarnings.keys(),
      ...dailyDownloads.keys(),
      ...detailEarningsByDay.keys(),
      ...otherEarningsByDay.keys(),
    ]);
    for (const date of [...allDays].sort()) {
      const targetE = dailyEarnings.get(date) ?? 0;
      const targetD = dailyDownloads.get(date) ?? 0;
      const knownE =
        (detailEarningsByDay.get(date) ?? 0) +
        (otherEarningsByDay.get(date) ?? 0);
      const knownD = detailDownloadsByDay.get(date) ?? 0;
      const diffE = round6(targetE - knownE);
      const diffD = Math.max(0, Math.round(targetD - knownD));
      // Ignore sub-cent rounding drift on payout-only days (e.g. other-payments
      // rounded to 2 decimals vs 12-decimal insights/earnings).
      if (diffD === 0 && Math.abs(diffE) < 0.01) continue;
      if (diffD > 0 || Math.abs(diffE) >= 0.0001) {
        otherSales.push({
          date,
          amount: diffE,
          count: diffD,
          license: 'adobe_historical',
        });
      }
    }

    // Safety net against `overview` if the daily series ever omitted any tail.
    const collectedEarnings =
      allRows.reduce((s, r) => s + r.amount, 0) +
      otherSales.reduce((s, r) => s + r.amount, 0);
    const collectedDownloads =
      allRows.length + otherSales.reduce((s, r) => s + r.count, 0);
    const tailEarnings = round6(overview.totalEarnings - collectedEarnings);
    const tailDownloads = Math.max(
      0,
      overview.totalDownloads - collectedDownloads
    );
    if (Math.abs(tailEarnings) >= 0.02 || tailDownloads > 0) {
      otherSales.push({
        date: `${startYear}-01-01`,
        amount: tailEarnings,
        count: tailDownloads,
        license: 'adobe_historical',
      });
    }

    const portfolio: PortfolioItem[] = portfolioWithStats.map(
      ({ nbDownloads: _nb, ...rest }) => {
        void _nb;
        return rest;
      }
    );

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
    for (const product of products.values()) {
      addToDate(product.createdAt, product.id);
    }

    const shoots: Shoot[] = [...shootIdsByDate.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, ids]) => ({
        id: date,
        title: date,
        uploadedAt: date,
        photoIds: [...ids],
      }));

    const photoCount = portfolio.filter((p) => p.mediaType === 'photo').length;
    const videoCount = portfolio.filter((p) => p.mediaType === 'video').length;

    return {
      syncedAt: new Date().toISOString(),
      shutterstockTotal: overview.totalEarnings,
      shutterstockDownloads: overview.totalDownloads,
      portfolioSize: portfolio.length,
      photoCount,
      videoCount,
      portfolio,
      shoots,
      products: [...products.values()],
      otherSales,
    };
  } finally {
    await session.close();
  }
};
