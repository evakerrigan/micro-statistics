// Data collected from Shutterstock Contributor (submit.shutterstock.com) and
// kept in extension storage. Only the fields the statistics need are kept.

export type MediaKind = 'photo' | 'video';

export type Sale = {
  /** ISO date, e.g. `2026-08-15`. */
  date: string;
  /** Earnings in USD. */
  amount: number;
  /** Number of downloads/licenses included in this record. */
  count: number;
  /**
   * Normalized Shutterstock license / earnings category key, e.g. `25_a_day`,
   * `on_demand`, `enhanced`, `single_image_and_other`, `cart_sales`,
   * `clip_packs`, `footage_enhanced`, `earning_pools_commission`, `referrals`,
   * `unlimited`, `contest_award`, or `null` when unknown.
   */
  license: string | null;
};

/** A Shutterstock asset (photo, illustration, or video) with its sales. */
export type Product = {
  id: string;
  mediaType: MediaKind;
  isIllustration?: boolean;
  headline: string;
  /** Upload date on Shutterstock (`YYYY-MM-DD`); `null` when unknown. */
  createdAt: string | null;
  thumbUrl: string;
  url: string;
  sales: Sale[];
};

/** An approved item in the Shutterstock catalog (`media/search`). */
export type PortfolioItem = {
  id: string;
  mediaType: MediaKind;
  isIllustration?: boolean;
  headline: string;
  /** Upload date on Shutterstock (`YYYY-MM-DD`). */
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
 * An automatic shoot grouped by upload date (`YYYY-MM-DD`) on Shutterstock.
 */
export type Shoot = {
  /** Upload date `YYYY-MM-DD`. */
  id: string;
  /** Default title (upload date `YYYY-MM-DD`). */
  title: string;
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
 * Shoots the user joined together, as source key -> target key. Used when one
 * photo/video session was uploaded across several dates.
 */
export type ShootMerges = Record<string, string>;

/**
 * Years the user switched off in the charts of the “By upload year” tab, as
 * chart ID -> upload years.
 */
export type HiddenChartYears = Record<string, string[]>;

export type Dataset = {
  /** ISO timestamp of the last successful sync. */
  syncedAt: string;
  /** Lifetime earnings as reported by `/api/next/v2/earnings/summary`. */
  shutterstockTotal: number;
  /** Lifetime licensed downloads (excl. referrals) from summary. */
  shutterstockDownloads?: number;
  /** Total images & videos live in the marketplace (`/api/next/summary/media`). */
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
 * Incremental cache of finalized Shutterstock days/months so subsequent updates
 * only fetch newly added or modified dates.
 */
export type SyncCache = {
  version: 1;
  months: Record<string, CachedMonthAggregate>;
};
