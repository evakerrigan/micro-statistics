import { openAdobeSession } from '@/lib/adobe-client';
import { stockAssetUrl } from '@/lib/asset-url';
import type { Dataset, PortfolioItem, Product, Shoot } from '@/types/stock';
import {
  ADOBE_PORTFOLIO_PAGE_SIZE,
  type AdobeSaleRow,
  fetchAdobeEarningsSeries,
  fetchAdobeOtherPayments,
  fetchAdobeOverview,
  fetchAdobePortfolioPage,
  fetchAdobeSalesWindow,
  fetchAdobeTopSellerDates,
} from './api/adobe-api';
import type { SyncProgress } from './collect';

type OnProgress = (progress: SyncProgress) => void;

const MAX_PORTFOLIO_PAGES = 500;

const yearFromText = (text: string): number | null => {
  const m = /\b((?:19|20)\d{2})\b/.exec(text);
  return m ? Number(m[1]) : null;
};

const isoToday = (d = new Date()) => d.toISOString().slice(0, 10);

const buildTwoYearWindows = (startYear: number, now = new Date()) => {
  const currentYear = now.getFullYear();
  const today = isoToday(now);
  const windows: { start: string; end: string }[] = [];
  for (let y = startYear; y <= currentYear; y += 2) {
    const endYear = Math.min(y + 1, currentYear);
    const end = endYear === currentYear ? today : `${endYear}-12-31`;
    windows.push({ start: `${y}-01-01`, end });
  }
  return windows;
};

/**
 * Collects the contributor's full Adobe Stock portfolio (photos, vectors,
 * illustrations, videos), chunked sales history, and Firefly/other payouts.
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
    const series = await fetchAdobeEarningsSeries(session, '2000-01-01', today);

    // 1. Portfolio (photos + illustrations + vectors + videos)
    const byId = new Map<string, PortfolioItem>();
    onProgress({ step: 'portfolio', done: 0, total: 1 });
    for (let page = 1; page <= MAX_PORTFOLIO_PAGES; page++) {
      const items = await fetchAdobePortfolioPage(session, page);
      const before = byId.size;
      for (const item of items) byId.set(item.id, item);
      onProgress({
        step: 'portfolio',
        done: page,
        total: page + (items.length >= ADOBE_PORTFOLIO_PAGE_SIZE ? 1 : 0),
      });
      if (items.length < ADOBE_PORTFOLIO_PAGE_SIZE || byId.size === before) {
        break;
      }
    }
    const portfolio = [...byId.values()];

    // Determine earliest active year from monthly series + oldest portfolio item.
    const seriesYears = series.points
      .filter((p) => p.amount !== 0)
      .map((p) => yearFromText(p.key))
      .filter((y): y is number => y !== null);
    const portfolioYears = portfolio
      .map((p) => (p.createdAt ? Number(p.createdAt.slice(0, 4)) : null))
      .filter((y): y is number => y !== null && Number.isFinite(y));
    const startYear = Math.min(
      now.getFullYear(),
      ...(seriesYears.length ? seriesYears : [now.getFullYear()]),
      ...(portfolioYears.length ? portfolioYears : [now.getFullYear()])
    );

    // 2. Sales history in <= 2-year windows (avoids Adobe's 3-year rolling clamp).
    const windows = buildTwoYearWindows(startYear, now);
    const allRows: AdobeSaleRow[] = [];
    onProgress({ step: 'sales', done: 0, total: windows.length });
    for (const [i, w] of windows.entries()) {
      const res = await fetchAdobeSalesWindow(session, w.start, w.end);
      allRows.push(...res.rows);
      onProgress({ step: 'sales', done: i + 1, total: windows.length });
    }

    // 3. Other payments (Firefly Contributor Bonus, etc.)
    const otherSales = await fetchAdobeOtherPayments(
      session,
      `${startYear}-01-01`,
      today
    );

    // 4. Optional fallback: try to recover creationDate for deleted sold assets.
    const portfolioById = new Map(portfolio.map((p) => [p.id, p]));
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

    // 5. Assemble normalized Dataset
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
