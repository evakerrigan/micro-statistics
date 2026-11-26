import { stockAssetUrl } from '@/lib/asset-url';
import {
  ShutterstockAuthError,
  ShutterstockFormatError,
  type ShutterstockSession,
} from '@/lib/shutterstock-client';
import type { MediaKind, PortfolioItem } from '@/types/stock';

export const assetPublicUrl = (id: string, mediaType: MediaKind) =>
  stockAssetUrl('shutterstock', id, mediaType);

export const PORTFOLIO_PAGE_SIZE = 100;
export const STATS_PAGE_SIZE = 500;

export const ASSET_LICENSES = [
  '25_a_day',
  'on_demand',
  'enhanced',
  'single_image_and_other',
  'cart_sales',
  'clip_packs',
  'footage_enhanced',
] as const;

export type AssetLicense = (typeof ASSET_LICENSES)[number];

const ASSET_LICENSE_SET = new Set<string>(ASSET_LICENSES);

const REFERRAL_KEYS = new Set([
  'contributor_image_referrals',
  'contributor_video_referrals',
  'customer_referrals',
  'photo_referral',
  'video_referral',
  'referrals',
]);

const UNLIMITED_KEYS = new Set([
  'unlimited_photo_commission',
  'unlimited_video_commission',
  'unlimited',
]);

const NON_CATEGORY_DAY_KEYS = new Set(['date', 'earnings', 'downloads']);

export const roundMoney = (n: number) => Math.round(n * 10000) / 10000;

export const normalizeLicenseKey = (rawKey: string): string => {
  if (rawKey === 'footage_subscription') return 'clip_packs';
  if (rawKey === 'contributor_fund') return 'earning_pools_commission';
  if (REFERRAL_KEYS.has(rawKey)) return 'referrals';
  if (UNLIMITED_KEYS.has(rawKey)) return 'unlimited';
  return rawKey;
};

export const isAssetLicense = (key: string): key is AssetLicense =>
  ASSET_LICENSE_SET.has(normalizeLicenseKey(key));

export const isReferralLicense = (key: string) =>
  REFERRAL_KEYS.has(key) || key === 'referrals';

const isoDay = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const s = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// --- Account & Summary -------------------------------------------------------

type CurrentUserResponse = {
  details?: {
    account?: {
      id?: string | number;
      contributorId?: string | number;
      createTime?: string;
    };
  };
};

export type AccountInfo = {
  accountId: string;
  createTime: string | null;
};

export const fetchCurrentUser = async (
  session: ShutterstockSession
): Promise<AccountInfo> => {
  const data = await session.getJson<CurrentUserResponse>(
    '/api/next/users/current'
  );
  const account = data?.details?.account;
  if (!account?.id) throw new ShutterstockAuthError();
  return {
    accountId: String(account.id),
    createTime: isoDay(account.createTime),
  };
};

type EarningsSummaryResponse = {
  earnings?: { total?: number | string; count?: number };
  referrals?: { total?: number | string; count?: number };
};

export type EarningsSummary = {
  total: number;
  count: number;
  referralTotal: number;
};

export const fetchEarningsSummary = async (
  session: ShutterstockSession
): Promise<EarningsSummary> => {
  const data = await session.getJson<EarningsSummaryResponse>(
    '/api/next/v2/earnings/summary'
  );
  const total = Number(data?.earnings?.total);
  const count = Number(data?.earnings?.count);
  if (!Number.isFinite(total) || !Number.isFinite(count)) {
    throw new ShutterstockFormatError('earnings summary missing total/count');
  }
  return {
    total,
    count,
    referralTotal: Number(data?.referrals?.total ?? 0) || 0,
  };
};

type MediaSummaryResponse = {
  photo?: { marketplace?: number };
  video?: { marketplace?: number };
};

export type MediaSummary = {
  photoCount: number;
  videoCount: number;
};

export const fetchMediaSummary = async (
  session: ShutterstockSession
): Promise<MediaSummary> => {
  const data = await session.getJson<MediaSummaryResponse>(
    '/api/next/summary/media'
  );
  return {
    photoCount: Number(data?.photo?.marketplace ?? 0) || 0,
    videoCount: Number(data?.video?.marketplace ?? 0) || 0,
  };
};

// --- Monthly Graph -----------------------------------------------------------

type GraphCategory = {
  name?: string;
  mediaType?: string;
  total?: string | number;
  count?: number;
  displayColumn?: string;
};

type GraphMonthRaw = {
  date?: string;
  total?: string | number;
  count?: number;
  countWithReferrals?: number;
  categories?: GraphCategory[];
};

type GraphResponse = {
  total?: string | number;
  count?: number;
  months?: GraphMonthRaw[];
};

export type GraphCategorySummary = {
  license: string;
  total: number;
};

export type GraphMonth = {
  /** `YYYY-MM` */
  month: string;
  total: number;
  count: number;
  countWithReferrals: number;
  categories: GraphCategorySummary[];
  signature: string;
};

const monthsDiff = (fromIso: string, now: Date) => {
  const [y, m] = fromIso.slice(0, 7).split('-').map(Number);
  return Math.max(
    1,
    (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) + 2
  );
};

export const fetchEarningsGraph = async (
  session: ShutterstockSession,
  createTime: string | null,
  now = new Date()
): Promise<GraphMonth[]> => {
  const targetMonths = createTime
    ? Math.max(120, monthsDiff(createTime, now))
    : 120;
  const fetchWindow = async (
    year: number,
    month: number,
    monthsAgo: number
  ) => {
    const params = new URLSearchParams({
      year: String(year),
      month: String(month),
      aggregation_period: 'month',
      months_ago: String(monthsAgo),
      locale: 'en',
      group_by: 'earnings_type',
    });
    return session.getJson<GraphResponse>(
      `/api/next/v2/earnings/graph?${params}`
    );
  };

  let rawMonths: GraphMonthRaw[];
  try {
    const data = await fetchWindow(
      now.getFullYear(),
      now.getMonth() + 1,
      targetMonths
    );
    rawMonths = data.months ?? [];
  } catch {
    // Fallback for very old accounts if the backend ever caps `months_ago`:
    // walk backwards in 120-month chunks.
    const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
    const earliestYear = createTime ? Number(createTime.slice(0, 4)) : 2003;
    const seen = new Map<string, GraphMonthRaw>();
    while (cursor.getFullYear() >= earliestYear) {
      const data = await fetchWindow(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        120
      );
      const chunk = data.months ?? [];
      if (!chunk.length) break;
      for (const m of chunk) {
        if (m.date) seen.set(m.date.slice(0, 7), m);
      }
      cursor.setMonth(cursor.getMonth() - 120);
    }
    rawMonths = [...seen.values()];
  }

  const byMonth = new Map<string, GraphMonth>();
  for (const m of rawMonths) {
    const month = m.date?.slice(0, 7);
    if (!month || !/^\d{4}-\d{2}$/.test(month)) continue;
    const total = Number(m.total ?? 0) || 0;
    const count = Number(m.count ?? 0) || 0;
    const countWithReferrals = Number(m.countWithReferrals ?? count) || 0;
    const categories = (m.categories ?? []).map((c) => ({
      license: normalizeLicenseKey(c.displayColumn ?? c.name ?? ''),
      total: Number(c.total ?? 0) || 0,
    }));
    const catSig = (m.categories ?? [])
      .map((c) => `${c.name ?? ''}:${c.total ?? 0}:${c.count ?? 0}`)
      .sort()
      .join(',');
    byMonth.set(month, {
      month,
      total,
      count,
      countWithReferrals,
      categories,
      signature: `${m.total ?? 0}|${count}|${countWithReferrals}|${catSig}`,
    });
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
};

// --- Monthly Daily Aggregate -------------------------------------------------

type AggregateCategoryEntry = {
  earnings?: number | string;
  downloads?: number;
};

type AggregateDayRaw = {
  date?: string;
  earnings?: number | string;
  downloads?: number;
  [key: string]: unknown;
};

type AggregateResponse = {
  days?: AggregateDayRaw[];
};

export type AggregateDayCategory = {
  rawKey: string;
  license: string;
  earnings: number;
  downloads: number;
};

export type AggregateDay = {
  date: string;
  earnings: number;
  downloads: number;
  categories: AggregateDayCategory[];
  assetKey: string;
};

const isCategoryEntry = (val: unknown): val is AggregateCategoryEntry =>
  typeof val === 'object' && val !== null && 'earnings' in val;

export const fetchMonthAggregate = async (
  session: ShutterstockSession,
  year: number,
  month: number
): Promise<AggregateDay[]> => {
  const params = new URLSearchParams({
    aggregation_period: 'day',
    year: String(year),
    month: String(month),
  });
  const data = await session.getJson<AggregateResponse>(
    `/api/next/v2/earnings/aggregate?${params}`
  );
  if (!Array.isArray(data?.days)) {
    throw new ShutterstockFormatError(
      `aggregate missing days for ${year}-${month}`
    );
  }

  const days: AggregateDay[] = [];
  for (const raw of data.days) {
    const date = isoDay(raw.date);
    if (!date) continue;
    const categories: AggregateDayCategory[] = [];
    for (const [key, val] of Object.entries(raw)) {
      if (NON_CATEGORY_DAY_KEYS.has(key) || !isCategoryEntry(val)) continue;
      const earnings = Number(val.earnings ?? 0) || 0;
      const downloads = Number(val.downloads ?? 0) || 0;
      if (earnings === 0 && downloads === 0) continue;
      categories.push({
        rawKey: key,
        license: normalizeLicenseKey(key),
        earnings,
        downloads,
      });
    }
    const assetKey = categories
      .filter((c) => isAssetLicense(c.license))
      .map((c) => `${c.license}:${c.downloads}:${c.earnings}`)
      .sort()
      .join('|');
    days.push({
      date,
      earnings: Number(raw.earnings ?? 0) || 0,
      downloads: Number(raw.downloads ?? 0) || 0,
      categories,
      assetKey,
    });
  }
  return days;
};

// --- Daily Asset Stats -------------------------------------------------------

type MediaStatsDayItemRaw = {
  category?: string;
  count?: number;
  total?: number | string;
  mediaId?: string | number;
  uploadDate?: string;
  assetType?: string;
  details?: {
    description?: string;
    previewImageUrl?: string;
  };
};

type MediaStatsDayResponse = {
  count?: number;
  total?: number;
  pages?: number;
  media?: MediaStatsDayItemRaw[];
};

export type DailyAssetRow = {
  mediaId: string;
  mediaType: MediaKind;
  date: string;
  amount: number;
  count: number;
  license: string;
  headline: string;
  thumbUrl: string;
  uploadDate: string | null;
};

export const fetchDayMediaStats = async (
  session: ShutterstockSession,
  date: string,
  displayColumn: AssetLicense
): Promise<DailyAssetRow[]> => {
  const rows: DailyAssetRow[] = [];
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      display_column: displayColumn,
      date,
      page: String(page),
      per_page: String(STATS_PAGE_SIZE),
    });
    const data = await session.getJson<MediaStatsDayResponse>(
      `/api/next/v2/earnings/media_stats/day?${params}`
    );
    const media = data?.media;
    if (!Array.isArray(media)) {
      throw new ShutterstockFormatError(
        `media_stats/day missing media array (${date} ${displayColumn})`
      );
    }
    for (const item of media) {
      if (item.mediaId === undefined || item.mediaId === null) continue;
      rows.push({
        mediaId: String(item.mediaId),
        mediaType: item.assetType === 'video_set' ? 'video' : 'photo',
        date,
        amount: Number(item.total ?? 0) || 0,
        count: Number(item.count ?? 0) || 0,
        license: displayColumn,
        headline: item.details?.description?.trim() ?? '',
        thumbUrl: item.details?.previewImageUrl ?? '',
        uploadDate: isoDay(item.uploadDate),
      });
    }
    const pages = Number(data.pages ?? 1) || 1;
    if (page >= pages || !media.length) break;
  }
  return rows;
};

// --- Portfolio (Photos + Videos) ---------------------------------------------

type MediaSearchItemRaw = {
  id?: string | number;
  mediaId?: string | number;
  mediaType?: string;
  isIllustration?: boolean;
  description?: string;
  uploadedDate?: string;
  updatedTime?: string;
  previewImageUrl?: string;
  smallThumb?: string;
  mosaic250?: { url?: string };
  normalizedProps?: {
    displayName?: string;
    preview?: { url?: string };
  };
};

type MediaSearchResponse = {
  total?: number;
  totalCount?: number;
  data?: MediaSearchItemRaw[];
};

export type PortfolioPage = {
  total: number | null;
  items: PortfolioItem[];
};

export const fetchPortfolioPage = async (
  session: ShutterstockSession,
  mediaType: MediaKind,
  page: number
): Promise<PortfolioPage> => {
  const params = new URLSearchParams({
    mediaType,
    namespace: 'shutterstock',
    sortOrder: 'oldest',
    allowInject: 'false',
    normalize: 'true',
    page: String(page),
    perPage: String(PORTFOLIO_PAGE_SIZE),
  });
  const data = await session.getJson<MediaSearchResponse>(
    `/api/next/media/search?${params}`
  );
  if (!Array.isArray(data?.data)) {
    throw new ShutterstockFormatError(
      `media/search missing data (${mediaType})`
    );
  }
  const items: PortfolioItem[] = [];
  for (const raw of data.data) {
    const rawId = raw.mediaId ?? raw.id;
    if (rawId === undefined || rawId === null) continue;
    items.push({
      id: String(rawId),
      mediaType: raw.mediaType === 'video' ? 'video' : mediaType,
      isIllustration: Boolean(raw.isIllustration),
      headline: (
        raw.description ??
        raw.normalizedProps?.displayName ??
        ''
      ).trim(),
      createdAt: isoDay(raw.uploadedDate) ?? isoDay(raw.updatedTime),
      thumbUrl:
        raw.previewImageUrl ||
        raw.normalizedProps?.preview?.url ||
        raw.smallThumb ||
        raw.mosaic250?.url ||
        '',
    });
  }
  const totalRaw = data.totalCount ?? data.total;
  return {
    total: typeof totalRaw === 'number' ? totalRaw : null,
    items,
  };
};
