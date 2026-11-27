// Normalized microstock data types kept in extension storage per stock.

export type StockId = 'adobe' | 'shutterstock' | 'istock';

export const STOCK_IDS: readonly StockId[] = [
  'adobe',
  'shutterstock',
  'istock',
];

export type MediaKind = 'photo' | 'video';

export type Sale = {
  /** ISO date, e.g. `2026-08-15`. */
  date: string;
  /** Earnings in USD. */
  amount: number;
  /** Number of downloads/licenses included in this record. */
  count: number;
  /**
   * Normalized license / earnings category key, e.g. `25_a_day`,
   * `on_demand`, `enhanced`, `single_image_and_other`, `cart_sales`,
   * `clip_packs`, `footage_enhanced`, `earning_pools_commission`, `referrals`,
   * `unlimited`, `contest_award`, or `null` when unknown.
   */
  license: string | null;
};

/** A portfolio asset (photo, illustration, or video) with its sales. */
export type Product = {
  id: string;
  mediaType: MediaKind;
  isIllustration?: boolean;
  headline: string;
  /** Upload date on the stock (`YYYY-MM-DD`); `null` when unknown. */
  createdAt: string | null;
  thumbUrl: string;
  url: string;
  sales: Sale[];
  /**
   * Lifetime download count reported by the catalog when per-sale records for
   * older periods (e.g. Adobe Stock >3 years) are not exposed per asset.
   */
  lifetimeDownloads?: number;
};

/** An approved item in the stock catalog. */
export type PortfolioItem = {
  id: string;
  mediaType: MediaKind;
  isIllustration?: boolean;
  headline: string;
  /** Upload date on the stock (`YYYY-MM-DD`). */
  createdAt: string | null;
  thumbUrl: string;
};

/** A published item inside a shoot. */
export type ShootPhoto = {
  id: string;
  mediaType: MediaKind;
  isIllustration?: boolean;
  headline: string | null;
  publishedAt: string | null;
  thumbUrl: string | null;
};

/**
 * An automatic shoot grouped by upload date (`YYYY-MM-DD`).
 */
export type Shoot = {
  /** Upload date `YYYY-MM-DD` (or deterministic cluster ID for similarity shoots). */
  id: string;
  /** Default title (upload date `YYYY-MM-DD`). */
  title: string;
  /** Optional 1-based sequential shoot number (used by similarity-grouped shoots). */
  sequenceNumber?: number;
  /** Upload date `YYYY-MM-DD`. */
  uploadedAt: string;
  /** IDs of all known photos and videos uploaded on that date. */
  photoIds: string[];
};

/**
 * A shoot the user put together by hand. Kept separately from the synced
 * data so re-syncing never touches it.
 */
export type ManualShoot = {
  id: string;
  title: string;
  productIds: string[];
  createdAt: string;
};

/**
 * Custom titles given by the user to upload-date shoots, as shoot key -> title.
 */
export type ShootNames = Record<string, string>;

/**
 * Shoots the user joined together, as source key -> target key.
 */
export type ShootMerges = Record<string, string>;

/**
 * Years the user switched off in the charts of the “By upload year” tab, as
 * chart ID -> upload years.
 */
export type HiddenChartYears = Record<string, string[]>;

/** Visual perceptual fingerprint of a portfolio thumbnail for cross-stock matching. */
export type ImageFingerprint = {
  /** Hash algorithm version so improvements trigger automatic recomputation. */
  ver?: number;
  /** 16-char hex: 64-bit horizontal gradient dHash. */
  h: string;
  /** 16-char hex: 64-bit vertical gradient dHash. */
  v: string;
  /** Mean RGB color [r, g, b], 0..255. */
  rgb: [number, number, number];
  /** Aspect ratio * 100 (e.g. 150 for 3:2). */
  aspect: number;
};

/** User overrides for cross-stock photo/video matching on the "All" tab. */
export type AssetMatchOverrides = {
  /** Manually linked pairs `[uidA, uidB]`, where uid is `${stock}:${id}`. */
  links: [string, string][];
  /** Canonical sorted pair keys `"uidA|uidB"` the user explicitly unlinked. */
  unlinks: string[];
};

export type Dataset = {
  /** ISO timestamp of the last successful sync. */
  syncedAt: string;
  /** Lifetime earnings as reported by the stock's earnings summary. */
  shutterstockTotal: number;
  /** Lifetime licensed downloads from summary. */
  shutterstockDownloads?: number;
  /** Total images & videos live in the marketplace. */
  portfolioSize: number;
  photoCount?: number;
  videoCount?: number;
  /** Every live item (photos, illustrations, videos) in the portfolio. */
  portfolio: PortfolioItem[];
  /** Automatic upload-date shoots. */
  shoots: Shoot[];
  /** Every asset that sold, with its sales. */
  products: Product[];
  /**
   * Earnings not tied to a single asset in daily asset stats (e.g. Contributor
   * Fund, referrals, unlimited pools, prizes, or deleted-asset residuals).
   */
  otherSales: Sale[];
};

/** Daily asset sale entry cached per `(date, display_column)`. */
export type CachedAssetSale = {
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

export type CachedDaySales = {
  earnings: number;
  downloads: number;
  /** Sorted fingerprint of asset-category totals on that day. */
  assetKey: string;
  assetRows: CachedAssetSale[];
  otherRows: Sale[];
};

export type CachedMonthAggregate = {
  month: string;
  /** Signature from `/v2/earnings/graph` to skip unchanged closed months. */
  signature: string;
  days: Record<string, CachedDaySales>;
};

/**
 * Incremental cache of finalized days/months so subsequent updates only
 * fetch newly added or modified dates.
 */
export type SyncCache = {
  version: 1;
  months: Record<string, CachedMonthAggregate>;
};
