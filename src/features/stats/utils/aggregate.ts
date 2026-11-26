import type {
  Dataset,
  ManualShoot,
  PortfolioItem,
  Product,
  Sale,
  ShootMerges,
  ShootNames,
  ShootPhoto,
  StockId,
} from '@/types/stock';

export type LicenseTotals = Record<string, number>;

export type PhotoStat = {
  /** Optional disambiguated key when combining assets across multiple stocks. */
  uid?: string;
  product: Product;
  /** {@link ShootStat.key} of the shoot this file belongs to. */
  shootKey: string | null;
  sales: Sale[];
  salesCount: number;
  revenue: number;
  lastSale: string | null;
  byLicense: LicenseTotals;
};

/**
 * - `auto`: an automatic shoot grouped by upload date
 * - `manual`: a shoot the user created by hand
 * - `unmatched`: files without an upload date
 */
export type ShootKind = 'auto' | 'manual' | 'unmatched';

export type ShootStat = {
  key: string;
  kind: ShootKind;
  manualId: string | null;
  title: string;
  customTitle: string | null;
  /** Upload date `YYYY-MM-DD` for upload-date shoots. */
  uploadedAt: string | null;
  /** Earliest upload date among this shoot's files. */
  publishedAt: string | null;
  /** Files in the shoot (photos + videos). */
  publishedCount: number | null;
  thumbUrl: string | null;
  /** Files with at least one sale. */
  photos: PhotoStat[];
  /** Files with no sales. */
  unsoldPhotos: ShootPhoto[];
  salesCount: number;
  revenue: number;
  revenuePerPhoto: number | null;
  lastSale: string | null;
  byLicense: LicenseTotals;
  /** Shoots the user joined into this one. */
  mergedFrom: { key: string; title: string }[];
};

export type MonthStat = {
  /** `YYYY-MM` */
  key: string;
  revenue: number;
  salesCount: number;
  byLicense: LicenseTotals;
};

export type Stats = {
  revenue: number;
  salesCount: number;
  soldPhotos: number;
  /** Files live in the marketplace (photos + videos). */
  publishedPhotos: number;
  photoCount: number;
  videoCount: number;
  /** Revenue per file that sold at least once. */
  revenuePerSoldPhoto: number | null;
  /** Revenue per file in the whole portfolio. */
  revenuePerPortfolioPhoto: number | null;
  /** All license/earnings categories sorted by revenue. */
  licenses: string[];
  /** Asset-level license types that sold in `photos`/`shoots`. */
  assetLicenses: string[];
  photos: PhotoStat[];
  shoots: ShootStat[];
  months: MonthStat[];
  /** Earnings not tied to a single asset in daily stats. */
  otherRevenue: number;
  /** Lifetime earnings as reported by Shutterstock's earnings summary. */
  shutterstockTotal: number;
  /** Upload dates of the portfolio files, oldest first. */
  portfolioDates: string[];
};

/** License key for sales without one; shown translated in the UI. */
export const UNKNOWN_LICENSE = 'other';
export const UNMATCHED_KEY = 'unmatched';

export const autoShootKey = (id: string, stock: StockId = 'shutterstock') =>
  `${stock}:${id}`;
export const manualShootKey = (id: string) => `manual:${id}`;

const round = (n: number) => Math.round(n * 10000) / 10000;
const licenseOf = (sale: Sale) => sale.license ?? UNKNOWN_LICENSE;
export const saleCountOf = (sale: Sale) => sale.count ?? 1;

const addTo = (totals: LicenseTotals, key: string, amount: number) => {
  totals[key] = round((totals[key] ?? 0) + amount);
};

const latest = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : a > b ? a : b;

const earliest = (dates: (string | null)[]) =>
  dates.reduce<string | null>(
    (min, d) => (d && (!min || d < min) ? d : min),
    null
  );

/** Numeric ID comparison in upload order (`900000000` before `1981940708`). */
export const compareAssetIds = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

/** Only automatic upload-date shoots can be joined; own shoots are edited directly. */
export const isMergeable = (shoot: ShootStat) => shoot.kind === 'auto';

/** Sort key for “Uploaded”: shoot's upload date or earliest file upload date. */
export const uploadedSortKey = (s: ShootStat) =>
  s.uploadedAt ?? s.publishedAt ?? '';

/** Follows merge links to the shoot that finally takes in `key`. */
const resolveMerge = (
  key: string,
  merges: ShootMerges,
  existing: Set<string>
) => {
  const path = [key];
  for (;;) {
    const next = merges[path[path.length - 1]];
    if (!next || !existing.has(next)) return path[path.length - 1];
    const loopStart = path.indexOf(next);
    if (loopStart >= 0) {
      return [...path.slice(loopStart)].sort()[0];
    }
    path.push(next);
  }
};

const combineShoots = (target: ShootStat, sources: ShootStat[]): ShootStat => {
  const all = [target, ...sources];
  const photos = all
    .flatMap((s) => s.photos)
    .sort((a, b) => b.revenue - a.revenue);
  const byLicense: LicenseTotals = {};
  for (const shoot of all) {
    for (const [license, amount] of Object.entries(shoot.byLicense)) {
      addTo(byLicense, license, amount);
    }
  }
  const revenue = round(all.reduce((sum, s) => sum + s.revenue, 0));
  const publishedCount = all.every((s) => s.publishedCount !== null)
    ? all.reduce((sum, s) => sum + (s.publishedCount ?? 0), 0)
    : null;
  return {
    ...target,
    uploadedAt: earliest(all.map((s) => s.uploadedAt)),
    publishedAt: earliest(all.map((s) => s.publishedAt)),
    publishedCount,
    thumbUrl: photos[0]?.product.thumbUrl ?? target.thumbUrl,
    photos,
    unsoldPhotos: all.flatMap((s) => s.unsoldPhotos),
    salesCount: all.reduce((sum, s) => sum + s.salesCount, 0),
    revenue,
    revenuePerPhoto: publishedCount ? round(revenue / publishedCount) : null,
    lastSale: all.reduce<string | null>((d, s) => latest(d, s.lastSale), null),
    byLicense,
    mergedFrom: sources.map((s) => ({
      key: s.key,
      title: s.customTitle ?? s.title,
    })),
  };
};

/** Folds every joined shoot into the shoot it was joined to. */
const foldMerges = (shoots: ShootStat[], merges: ShootMerges) => {
  const existing = new Set(shoots.filter(isMergeable).map((s) => s.key));
  const resolve = (key: string) =>
    existing.has(key) ? resolveMerge(key, merges, existing) : key;

  const sourcesOf = new Map<string, ShootStat[]>();
  for (const shoot of shoots) {
    const target = resolve(shoot.key);
    if (target !== shoot.key) {
      sourcesOf.set(target, [...(sourcesOf.get(target) ?? []), shoot]);
    }
  }
  const folded = shoots
    .filter((s) => resolve(s.key) === s.key)
    .map((s) =>
      sourcesOf.has(s.key) ? combineShoots(s, sourcesOf.get(s.key)!) : s
    );
  return { shoots: folded, resolve };
};

const portfolioToShootPhoto = (item: PortfolioItem): ShootPhoto => ({
  id: item.id,
  mediaType: item.mediaType,
  isIllustration: item.isIllustration,
  headline: item.headline,
  publishedAt: item.createdAt,
  thumbUrl: item.thumbUrl,
});

export const buildStats = (
  dataset: Dataset,
  manualShoots: ManualShoot[] = [],
  shootMerges: ShootMerges = {},
  shootNames: ShootNames = {},
  stock: StockId = 'shutterstock'
): Stats => {
  const portfolioById = new Map(dataset.portfolio.map((p) => [p.id, p]));
  const autoPrefix = `${stock}:`;

  // Priority: the user's manual assignment, then upload-date shoots.
  const shootKeyOf = new Map<string, string>();
  for (const shoot of dataset.shoots) {
    const key = autoShootKey(shoot.id, stock);
    for (const id of shoot.photoIds) {
      shootKeyOf.set(id, key);
    }
  }
  for (const manual of manualShoots) {
    for (const productId of manual.productIds) {
      shootKeyOf.set(productId, manualShootKey(manual.id));
    }
  }

  const assetLicenseTotals: LicenseTotals = {};
  const photos: PhotoStat[] = dataset.products.map((product) => {
    const byLicense: LicenseTotals = {};
    let salesCount = 0;
    for (const sale of product.sales) {
      const lic = licenseOf(sale);
      addTo(byLicense, lic, sale.amount);
      addTo(assetLicenseTotals, lic, sale.amount);
      salesCount += saleCountOf(sale);
    }
    return {
      product: {
        ...product,
        createdAt:
          product.createdAt ?? portfolioById.get(product.id)?.createdAt ?? null,
      },
      shootKey: shootKeyOf.get(product.id) ?? null,
      sales: product.sales,
      salesCount,
      revenue: round(product.sales.reduce((sum, s) => sum + s.amount, 0)),
      lastSale: product.sales.reduce<string | null>(
        (d, s) => latest(d, s.date),
        null
      ),
      byLicense,
    };
  });
  photos.sort((a, b) => b.revenue - a.revenue);
  const soldIds = new Set(photos.map((p) => p.product.id));

  type ShootBase = Pick<
    ShootStat,
    | 'key'
    | 'kind'
    | 'manualId'
    | 'title'
    | 'customTitle'
    | 'uploadedAt'
    | 'publishedAt'
    | 'publishedCount'
    | 'unsoldPhotos'
  >;

  const makeShoot = (base: ShootBase, shootPhotos: PhotoStat[]): ShootStat => {
    const byLicense: LicenseTotals = {};
    let salesCount = 0;
    let lastSale: string | null = null;
    for (const photo of shootPhotos) {
      salesCount += photo.salesCount;
      lastSale = latest(lastSale, photo.lastSale);
      for (const [license, amount] of Object.entries(photo.byLicense)) {
        addTo(byLicense, license, amount);
      }
    }
    const revenue = round(shootPhotos.reduce((sum, p) => sum + p.revenue, 0));
    return {
      ...base,
      publishedAt:
        base.publishedAt ??
        earliest(shootPhotos.map((p) => p.product.createdAt)),
      thumbUrl:
        shootPhotos[0]?.product.thumbUrl ??
        base.unsoldPhotos[0]?.thumbUrl ??
        null,
      photos: shootPhotos,
      salesCount,
      revenue,
      revenuePerPhoto: base.publishedCount
        ? round(revenue / base.publishedCount)
        : null,
      lastSale,
      byLicense,
      mergedFrom: [],
    };
  };

  const photosOf = (key: string | null) =>
    photos.filter((p) => p.shootKey === key);

  const shoots = dataset.shoots.flatMap((shoot) => {
    const key = autoShootKey(shoot.id, stock);
    // Files the user moved into an own shoot are no longer counted here.
    const ids = shoot.photoIds.filter((id) => shootKeyOf.get(id) === key);
    const shootPhotos = photosOf(key);
    const unsold = ids
      .filter((id) => !soldIds.has(id))
      .flatMap((id): ShootPhoto[] => {
        const item = portfolioById.get(id);
        return item ? [portfolioToShootPhoto(item)] : [];
      });
    const published = shootPhotos.length + unsold.length;
    if (!published) return [];
    const customTitle = shootNames[key] ?? null;
    return makeShoot(
      {
        key,
        kind: 'auto',
        manualId: null,
        title: shoot.title,
        customTitle,
        uploadedAt: shoot.uploadedAt,
        publishedAt: earliest([
          shoot.uploadedAt,
          ...unsold.map((p) => p.publishedAt),
          ...shootPhotos.map((p) => p.product.createdAt),
        ]),
        publishedCount: published,
        unsoldPhotos: unsold,
      },
      shootPhotos
    );
  });

  // Unsold portfolio files outside upload-date shoots: belong to a manual
  // shoot or to «No shoot».
  const unsoldByKey = new Map<string | null, ShootPhoto[]>();
  for (const item of dataset.portfolio) {
    const key = shootKeyOf.get(item.id) ?? null;
    if (soldIds.has(item.id) || key?.startsWith(autoPrefix)) continue;
    unsoldByKey.set(key, [
      ...(unsoldByKey.get(key) ?? []),
      portfolioToShootPhoto(item),
    ]);
  }
  const countOf = (sold: PhotoStat[], unsold: ShootPhoto[]) =>
    dataset.portfolio.length ? sold.length + unsold.length : null;

  for (const manual of manualShoots) {
    const key = manualShootKey(manual.id);
    const shootPhotos = photosOf(key);
    const unsold = unsoldByKey.get(key) ?? [];
    if (!shootPhotos.length && !unsold.length) continue;
    shoots.push(
      makeShoot(
        {
          key,
          kind: 'manual',
          manualId: manual.id,
          title: manual.title,
          customTitle: null,
          uploadedAt: null,
          publishedAt: earliest([
            ...unsold.map((p) => p.publishedAt),
            ...shootPhotos.map((p) => p.product.createdAt),
          ]),
          publishedCount: countOf(shootPhotos, unsold),
          unsoldPhotos: unsold,
        },
        shootPhotos
      )
    );
  }

  const unmatched = photosOf(null);
  const unmatchedUnsold = unsoldByKey.get(null) ?? [];
  if (unmatched.length || unmatchedUnsold.length) {
    shoots.push(
      makeShoot(
        {
          key: UNMATCHED_KEY,
          kind: 'unmatched',
          manualId: null,
          title: '',
          customTitle: null,
          uploadedAt: null,
          publishedAt: null,
          publishedCount: countOf(unmatched, unmatchedUnsold),
          unsoldPhotos: unmatchedUnsold,
        },
        unmatched
      )
    );
  }

  const merged = foldMerges(shoots, shootMerges);
  merged.shoots.sort((a, b) => b.revenue - a.revenue);
  const finalPhotos = photos.map((p) =>
    p.shootKey ? { ...p, shootKey: merged.resolve(p.shootKey) } : p
  );

  // Months
  const monthMap = new Map<string, MonthStat>();
  for (const sale of [
    ...photos.flatMap((p) => p.sales),
    ...dataset.otherSales,
  ]) {
    const key = sale.date.slice(0, 7);
    const month = monthMap.get(key) ?? {
      key,
      revenue: 0,
      salesCount: 0,
      byLicense: {},
    };
    month.revenue = round(month.revenue + sale.amount);
    month.salesCount += saleCountOf(sale);
    addTo(month.byLicense, licenseOf(sale), sale.amount);
    monthMap.set(key, month);
  }
  const months = [...monthMap.values()].sort((a, b) =>
    a.key.localeCompare(b.key)
  );

  const licenseTotals: LicenseTotals = {};
  for (const m of months) {
    for (const [license, amount] of Object.entries(m.byLicense)) {
      addTo(licenseTotals, license, amount);
    }
  }

  const otherRevenue = round(
    dataset.otherSales.reduce((sum, s) => sum + s.amount, 0)
  );
  const revenue = round(months.reduce((sum, m) => sum + m.revenue, 0));
  const soldPhotos = photos.filter(
    (p) => p.salesCount > 0 || p.revenue > 0
  ).length;
  const publishedPhotos = dataset.portfolioSize || dataset.portfolio.length;
  const photoCount =
    dataset.photoCount ??
    dataset.portfolio.filter((p) => p.mediaType === 'photo').length;
  const videoCount =
    dataset.videoCount ??
    dataset.portfolio.filter((p) => p.mediaType === 'video').length;

  return {
    revenue,
    salesCount: months.reduce((sum, m) => sum + m.salesCount, 0),
    soldPhotos,
    publishedPhotos,
    photoCount,
    videoCount,
    revenuePerSoldPhoto: soldPhotos ? round(revenue / soldPhotos) : null,
    revenuePerPortfolioPhoto: publishedPhotos
      ? round(revenue / publishedPhotos)
      : null,
    licenses: Object.keys(licenseTotals).sort(
      (a, b) => licenseTotals[b] - licenseTotals[a]
    ),
    assetLicenses: Object.keys(assetLicenseTotals).sort(
      (a, b) => assetLicenseTotals[b] - assetLicenseTotals[a]
    ),
    photos: finalPhotos,
    shoots: merged.shoots,
    months,
    otherRevenue,
    shutterstockTotal: dataset.shutterstockTotal,
    portfolioDates: dataset.portfolio
      .flatMap((p) => (p.createdAt ? [p.createdAt] : []))
      .sort(),
  };
};
