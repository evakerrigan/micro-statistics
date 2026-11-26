import {
  type AdobeSession,
  AdobeAuthError,
  AdobeFormatError,
} from '@/lib/adobe-client';
import type { MediaKind, PortfolioItem, Sale } from '@/types/stock';

export const ADOBE_PORTFOLIO_PAGE_SIZE = 100;

export const normalizeAdobeLicense = (transactionType: unknown): string => {
  const raw = typeof transactionType === 'string' ? transactionType.trim() : '';
  if (!raw) return 'other';
  if (raw === 'subscription') return 'adobe_subscription';
  if (raw === 'standard') return 'adobe_standard';
  if (raw === 'custom') return 'adobe_custom';
  return `adobe_${raw.toLowerCase()}`;
};

const toIsoDay = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    const s = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  return null;
};

const mediaKindOf = (typeId: unknown): MediaKind =>
  typeId === 4 || typeId === '4' || typeId === 'videos' ? 'video' : 'photo';

// --- Lifetime Overview -------------------------------------------------------

type OverviewResponse = {
  sales?: {
    downloads?: { total?: { number?: number } };
    earnings?: { total?: { amount?: number; currencyCode?: string } };
  };
};

export type AdobeOverview = {
  totalEarnings: number;
  totalDownloads: number;
};

export const fetchAdobeOverview = async (
  session: AdobeSession
): Promise<AdobeOverview> => {
  const data = await session.getJson<OverviewResponse>(
    `/${session.locale}/user/statistics/overview?time_range=total&pv=${Date.now()}`
  );
  const totalEarnings = Number(data?.sales?.earnings?.total?.amount);
  const totalDownloads = Number(data?.sales?.downloads?.total?.number);
  if (!Number.isFinite(totalEarnings) || !Number.isFinite(totalDownloads)) {
    throw new AdobeFormatError(
      'statistics/overview missing earnings or downloads'
    );
  }
  return { totalEarnings, totalDownloads };
};

// --- Daily / Monthly Insights Series (No 3-Year Clamp) -----------------------

type InsightsSeriesPointRaw = {
  date?: string;
  amount?: number | string;
  value?: number | string;
  total?: number | string;
};

type InsightsSeriesResponse = {
  user?: { userId?: string | number };
  insights?: {
    statistics?: {
      data?: InsightsSeriesPointRaw[];
      total?: number | string;
    };
  };
};

export type AdobeSeriesPoint = {
  /** `YYYY-MM-DD` for `day`, `YYYY-MM` for `month`. */
  key: string;
  value: number;
};

const fetchAdobeInsightsSeries = async (
  session: AdobeSession,
  route: 'earnings' | 'sales',
  startDate: string,
  endDate: string,
  timeRange: 'month' | 'day',
  pickValue: (pt: InsightsSeriesPointRaw) => number
): Promise<{ points: AdobeSeriesPoint[]; total: number }> => {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    time_range: timeRange,
    timestamp: String(Date.now()),
  });
  const data = await session.getJson<InsightsSeriesResponse>(
    `/${session.locale}/insights/${route}?${params}`
  );
  if (!data?.user?.userId && !data?.insights?.statistics) {
    throw new AdobeAuthError();
  }
  const stats = data.insights?.statistics;
  const points = (stats?.data ?? []).map((pt) => ({
    key: String(pt.date ?? ''),
    value: pickValue(pt),
  }));
  return {
    points,
    total: Number(stats?.total ?? 0) || 0,
  };
};

export const fetchAdobeEarningsSeries = (
  session: AdobeSession,
  startDate: string,
  endDate: string,
  timeRange: 'month' | 'day' = 'day'
) =>
  fetchAdobeInsightsSeries(
    session,
    'earnings',
    startDate,
    endDate,
    timeRange,
    (pt) => Number(pt.amount ?? pt.total ?? pt.value ?? 0) || 0
  );

export const fetchAdobeSalesSeries = (
  session: AdobeSession,
  startDate: string,
  endDate: string,
  timeRange: 'month' | 'day' = 'day'
) =>
  fetchAdobeInsightsSeries(
    session,
    'sales',
    startDate,
    endDate,
    timeRange,
    (pt) => Number(pt.total ?? pt.value ?? pt.amount ?? 0) || 0
  );

// --- Portfolio (Photos, Illustrations, Vectors, Videos) ----------------------

type PortfolioItemRaw = {
  id?: string | number;
  media_type_id?: number;
  contentType?: number;
  title?: string;
  originalName?: string;
  original_name?: string;
  creationDate?: number | string;
  thumbnailUrl?: string;
  thumbnail_url?: string;
  largePreviewUrl?: string;
  nb_downloads?: number;
  nbSales?: number;
};

type PortfolioResponse = {
  user?: { userId?: string | number };
  content?: PortfolioItemRaw[];
};

export type AdobePortfolioItem = PortfolioItem & {
  nbDownloads: number;
};

export type AdobePortfolioPage = {
  items: AdobePortfolioItem[];
  rawCount: number;
};

export const fetchAdobePortfolioPage = async (
  session: AdobeSession,
  page: number,
  sortBy: 'create_desc' | 'create_asc' = 'create_desc'
): Promise<AdobePortfolioPage> => {
  const params = new URLSearchParams({
    limit: String(ADOBE_PORTFOLIO_PAGE_SIZE),
    page: String(page),
    sort_by: sortBy,
    pv: String(Date.now()),
  });
  const data = await session.getJson<PortfolioResponse>(
    `/${session.locale}/portfolio?${params}`
  );
  if (!Array.isArray(data?.content)) {
    throw new AdobeFormatError(`portfolio page ${page} missing content array`);
  }
  const items: AdobePortfolioItem[] = [];
  for (const raw of data.content) {
    if (raw.id === undefined || raw.id === null) continue;
    const typeId = raw.media_type_id ?? raw.contentType;
    items.push({
      id: String(raw.id),
      mediaType: mediaKindOf(typeId),
      isIllustration: typeId === 2 || typeId === 3,
      headline: (
        raw.title ??
        raw.originalName ??
        raw.original_name ??
        ''
      ).trim(),
      createdAt: toIsoDay(raw.creationDate),
      thumbUrl:
        raw.thumbnailUrl ?? raw.thumbnail_url ?? raw.largePreviewUrl ?? '',
      nbDownloads: Number(raw.nb_downloads ?? raw.nbSales ?? 0) || 0,
    });
  }
  return { items, rawCount: data.content.length };
};

// --- Individual Sales History (<= 3-Year Rolling Window) ---------------------

type SaleHistoryItemRaw = {
  id?: string | number;
  saleDate?: string;
  assetType?: number | string;
  title?: string;
  originalName?: string;
  thumbnailUrl?: string;
  transactionType?: string;
  commissionAmount?: number | string;
  commission?: { amount?: number | string };
};

type SalesEarningsResponse = {
  view?: {
    pagination?: {
      page?: number;
      pages?: number;
      total?: number;
    };
  };
  sales?: {
    chartData?: {
      activityEarnings?: { total?: number | string };
      activityDownloads?: { total?: number };
    };
    history?: SaleHistoryItemRaw[];
  };
};

export type AdobeSaleRow = {
  mediaId: string;
  mediaType: MediaKind;
  isIllustration?: boolean;
  date: string;
  amount: number;
  license: string;
  headline: string;
  thumbUrl: string;
};

export type AdobeSalesWindowResult = {
  windowTotalEarnings: number;
  windowTotalDownloads: number;
  rows: AdobeSaleRow[];
};

export const fetchAdobeSalesWindow = async (
  session: AdobeSession,
  startDate: string,
  endDate: string,
  onPage?: (page: number, pages: number) => void
): Promise<AdobeSalesWindowResult> => {
  const rows: AdobeSaleRow[] = [];
  let windowTotalEarnings = 0;
  let windowTotalDownloads = 0;

  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      end_date: endDate,
      start_date: startDate,
      time_range: 'day',
      timestamp: String(Date.now()),
    });
    if (page > 1) params.set('page', String(page));

    const data = await session.getJson<SalesEarningsResponse>(
      `/${session.locale}/insights/sales-earnings?${params}`
    );
    const history = data?.sales?.history;
    if (!Array.isArray(history)) {
      throw new AdobeFormatError(
        `sales-earnings missing sales.history (${startDate}..${endDate})`
      );
    }

    if (page === 1) {
      windowTotalEarnings =
        Number(data.sales?.chartData?.activityEarnings?.total ?? 0) || 0;
      windowTotalDownloads =
        Number(data.sales?.chartData?.activityDownloads?.total ?? 0) || 0;
    }

    for (const raw of history) {
      if (raw.id === undefined || raw.id === null) continue;
      const date = toIsoDay(raw.saleDate);
      if (!date) continue;
      const amount =
        Number(raw.commissionAmount ?? raw.commission?.amount ?? 0) || 0;
      rows.push({
        mediaId: String(raw.id),
        mediaType: mediaKindOf(raw.assetType),
        isIllustration: raw.assetType === 2 || raw.assetType === 3,
        date,
        amount,
        license: normalizeAdobeLicense(raw.transactionType),
        headline: (raw.title ?? raw.originalName ?? '').trim(),
        thumbUrl: raw.thumbnailUrl ?? '',
      });
    }

    const pages = Number(data.view?.pagination?.pages ?? 1) || 1;
    onPage?.(page, pages);
    if (page >= pages || !history.length) break;
  }

  return { windowTotalEarnings, windowTotalDownloads, rows };
};

// --- Other Payments (Firefly Contributor Bonus, etc.) ------------------------

type CreditTransactionRaw = {
  creditTransactionTypeId?: number;
  amount?: number | string;
  creation?: string;
};

type OtherPaymentsResponse = {
  view?: {
    pagination?: {
      page?: number;
      pages?: number;
    };
  };
  insights?: {
    creditTransactions?: CreditTransactionRaw[];
  };
};

export const fetchAdobeOtherPayments = async (
  session: AdobeSession,
  startDate: string,
  endDate: string
): Promise<Sale[]> => {
  const sales: Sale[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      time_range: 'day',
      timestamp: String(Date.now()),
    });
    if (page > 1) params.set('page', String(page));

    const data = await session.getJson<OtherPaymentsResponse>(
      `/${session.locale}/insights/other-payments?${params}`
    );
    const list = data?.insights?.creditTransactions;
    if (!Array.isArray(list)) {
      throw new AdobeFormatError('other-payments missing creditTransactions');
    }
    for (const tx of list) {
      const date = toIsoDay(tx.creation);
      if (!date) continue;
      const amount = Number(tx.amount ?? 0) || 0;
      if (amount === 0) continue;
      sales.push({
        date,
        amount,
        count: 0,
        license:
          tx.creditTransactionTypeId === 77
            ? 'adobe_firefly'
            : 'adobe_other_payment',
      });
    }
    const pages = Number(data.view?.pagination?.pages ?? 1) || 1;
    if (page >= pages || !list.length) break;
  }
  return sales;
};

// --- Top Sellers (fallback for deleted assets' creationDate) -----------------

type TopSellerRaw = {
  id?: string | number;
  creationDate?: number | string;
};

type TopSellersResponse = {
  sales?: {
    topSellers?: TopSellerRaw[];
  };
};

export const fetchAdobeTopSellerDates = async (
  session: AdobeSession,
  startDate: string,
  endDate: string
): Promise<Map<string, string>> => {
  const dates = new Map<string, string>();
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    time_range: 'day',
    timestamp: String(Date.now()),
  });
  const data = await session.getJson<TopSellersResponse>(
    `/${session.locale}/insights/top-sellers?${params}`
  );
  for (const item of data?.sales?.topSellers ?? []) {
    if (item.id === undefined || item.id === null) continue;
    const date = toIsoDay(item.creationDate);
    if (date) dates.set(String(item.id), date);
  }
  return dates;
};
