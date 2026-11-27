import { stockAssetUrl } from '@/lib/asset-url';
import { openIstockSession } from '@/lib/istock-client';
import { loadSyncCache, saveSyncCache } from '@/lib/storage';
import type {
  CachedAssetSale,
  Dataset,
  MediaKind,
  PortfolioItem,
  Product,
  Sale,
  Shoot,
  SyncCache,
} from '@/types/stock';
import {
  type EspBatch,
  type EspDownloadSummary,
  exportStatementTsv,
  fetchAvailableContracts,
  fetchAvailablePeriods,
  fetchEspAdpUrls,
  fetchEspBatchContributions,
  fetchEspBatchesPage,
  fetchEspCurrentUser,
  fetchEspDownloadsPage,
  fetchEspStatsMonths,
  type GettyTsvRow,
  mediaKindFromGettyType,
  parseGettyTsv,
} from './api/istock-api';
import type { SyncProgress } from './collect';

type OnProgress = (progress: SyncProgress) => void;

const CACHE_SIGNATURE = 'tsv-v1';
const CONCURRENCY = 3;
const CHECKPOINT_EVERY = 10;
const ADP_CHUNK_SIZE = 50;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const isoToday = (d = new Date()) => d.toISOString().slice(0, 10);

const runPool = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) => {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
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

const monthEndIso = (monthKey: string): string => {
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${monthKey}-${String(lastDay).padStart(2, '0')}`;
};

type AssetMeta = {
  id: string;
  mediaType: MediaKind;
  isIllustration?: boolean;
  headline: string;
  createdAt: string | null;
  thumbUrl: string;
  url?: string;
};

/**
 * Collects iStock / Getty Images contributor data by combining:
 * 1. Monthly royalty TSV/CTSV exports from `accountmanagement.gettyimages.com`
 * 2. Download stats, thumbnails, approval dates, ADP URLs & submission batches
 *    from `esp.gettyimages.com`.
 */
export const collectIstockDataset = async (
  onProgress: OnProgress
): Promise<Dataset> => {
  onProgress({ step: 'connect', done: 0, total: 1 });
  const session = await openIstockSession();

  try {
    const today = isoToday();
    const cache: SyncCache = await loadSyncCache('istock');
    let cacheDirty = false;

    // 1. Monthly royalty statements (with incremental cache for closed months)
    const periods = await fetchAvailablePeriods(session);
    const latestPeriodKey =
      periods.length > 0 ? periods[periods.length - 1].monthKey : '';

    const tsvAssetRows: CachedAssetSale[] = [];
    const otherSales: Sale[] = [];

    onProgress({
      step: 'months',
      done: 0,
      total: Math.max(1, periods.length),
    });

    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      const cached = cache.months[period.monthKey];
      const canUseCache =
        cached &&
        cached.signature === CACHE_SIGNATURE &&
        period.monthKey !== latestPeriodKey;

      if (canUseCache) {
        for (const day of Object.values(cached.days)) {
          tsvAssetRows.push(...day.assetRows);
          otherSales.push(...day.otherRows);
        }
        onProgress({ step: 'months', done: i + 1, total: periods.length });
        continue;
      }

      const contracts = await fetchAvailableContracts(session, period.value);
      const targets =
        contracts.length > 0
          ? contracts
          : [
              {
                id: '',
                description: 'All',
                hasConnectSales: false,
                formValue: '',
              },
            ];

      const monthRows: GettyTsvRow[] = [];
      for (const contract of targets) {
        const tsvText = await exportStatementTsv(
          session,
          period.year,
          period.month,
          contract.formValue,
          'tsv'
        );
        monthRows.push(...parseGettyTsv(tsvText));

        if (contract.hasConnectSales) {
          const ctsvText = await exportStatementTsv(
            session,
            period.year,
            period.month,
            contract.formValue,
            'ctsv'
          );
          monthRows.push(...parseGettyTsv(ctsvText));
        }
      }

      const assetRows: CachedAssetSale[] = [];
      const monthOther: Sale[] = [];
      let earnings = 0;
      let downloads = 0;

      for (const row of monthRows) {
        const count = row.grossRoyaltyUsd < 0 ? 0 : 1;
        earnings += row.grossRoyaltyUsd;
        downloads += count;

        if (!row.assetId) {
          monthOther.push({
            date: row.salesDate,
            amount: round6(row.grossRoyaltyUsd),
            count,
            license: row.license,
          });
          continue;
        }

        assetRows.push({
          mediaId: row.assetId,
          mediaType: row.mediaType,
          date: row.salesDate,
          amount: round6(row.grossRoyaltyUsd),
          count,
          license: row.license,
          headline: row.headline,
          thumbUrl: '',
          uploadDate: row.isIllustration ? 'illustration' : null,
        });
      }

      cache.months[period.monthKey] = {
        month: period.monthKey,
        signature: CACHE_SIGNATURE,
        days: {
          '01': {
            earnings: round6(earnings),
            downloads,
            assetKey: '',
            assetRows,
            otherRows: monthOther,
          },
        },
      };
      cacheDirty = true;

      tsvAssetRows.push(...assetRows);
      otherSales.push(...monthOther);

      if ((i + 1) % CHECKPOINT_EVERY === 0) {
        await saveSyncCache(cache, 'istock');
        cacheDirty = false;
      }

      onProgress({ step: 'months', done: i + 1, total: periods.length });
    }

    if (cacheDirty) {
      await saveSyncCache(cache, 'istock');
    }

    // 2. ESP portfolio metadata (downloads_for_search + submission_batches)
    onProgress({ step: 'portfolio', done: 0, total: 1 });
    const espUser = await fetchEspCurrentUser(session);
    const espMonths = await fetchEspStatsMonths(session);

    const metaById = new Map<string, AssetMeta>();

    // 2a. All-time ESP downloads_for_search for thumbnails + ApprovalDate
    const firstDownloadsPage = await fetchEspDownloadsPage(
      session,
      '2018-01-01',
      today,
      1,
      100
    );
    const totalDownloadPages = Math.max(
      1,
      Math.ceil(firstDownloadsPage.totalAssets / 100)
    );
    const allEspDownloads: EspDownloadSummary[] = [...firstDownloadsPage.items];
    for (let page = 2; page <= totalDownloadPages; page++) {
      const res = await fetchEspDownloadsPage(
        session,
        '2018-01-01',
        today,
        page,
        100
      );
      allEspDownloads.push(...res.items);
      if (res.items.length === 0) break;
    }

    for (const item of allEspDownloads) {
      if (!item.MasterId) continue;
      const { mediaType, isIllustration } = mediaKindFromGettyType(
        item.ContentType ?? ''
      );
      metaById.set(item.MasterId, {
        id: item.MasterId,
        mediaType,
        isIllustration: isIllustration || undefined,
        headline: '',
        createdAt: item.ApprovalDate ? item.ApprovalDate.slice(0, 10) : null,
        thumbUrl: item.ThumbnailUrl ?? '',
      });
    }

    // 2b. ESP submission batches for full recent portfolio + headlines
    if (espUser.integrationId) {
      const batches: EspBatch[] = [];
      const firstBatchPage = await fetchEspBatchesPage(
        session,
        espUser.integrationId,
        '2015-01-01',
        today,
        1,
        50
      );
      batches.push(...firstBatchPage.items);
      const totalBatchPages = Math.ceil(firstBatchPage.totalItems / 50);
      for (let page = 2; page <= totalBatchPages; page++) {
        const res = await fetchEspBatchesPage(
          session,
          espUser.integrationId,
          '2015-01-01',
          today,
          page,
          50
        );
        batches.push(...res.items);
        if (res.items.length === 0) break;
      }

      const nonEmptyBatches = batches.filter((b) => b.contributions_count > 0);
      onProgress({
        step: 'portfolio',
        done: 0,
        total: Math.max(1, nonEmptyBatches.length),
      });

      let doneBatches = 0;
      await runPool(nonEmptyBatches, CONCURRENCY, async (batch) => {
        const contributions = await fetchEspBatchContributions(
          session,
          batch.id
        );
        for (const c of contributions) {
          const masterId = c.master_id ? String(c.master_id).trim() : '';
          if (!masterId) continue;
          const { mediaType, isIllustration } = mediaKindFromGettyType(
            c.esp_media_type ?? ''
          );
          const createdAt =
            (c.published_at || c.submitted_at || c.created_at)?.slice(0, 10) ??
            null;
          const existing = metaById.get(masterId);
          metaById.set(masterId, {
            id: masterId,
            mediaType: existing?.mediaType ?? mediaType,
            isIllustration:
              existing?.isIllustration ?? (isIllustration || undefined),
            headline:
              c.headline?.trim() || existing?.headline || c.file_name || '',
            createdAt: createdAt ?? existing?.createdAt ?? null,
            thumbUrl: c.thumbnail_url || existing?.thumbUrl || '',
          });
        }
        doneBatches++;
        onProgress({
          step: 'portfolio',
          done: doneBatches,
          total: nonEmptyBatches.length,
        });
      });
    }

    // 3. Pending downloads for months newer than the latest royalty TSV
    const pendingMonths = espMonths.filter((m) => m > latestPeriodKey);
    const pendingSalesByAsset = new Map<string, Sale[]>();

    if (pendingMonths.length > 0) {
      onProgress({ step: 'sales', done: 0, total: pendingMonths.length });
      for (let i = 0; i < pendingMonths.length; i++) {
        const m = pendingMonths[i];
        const fromDate = `${m}-01`;
        const toDate = monthEndIso(m);
        const first = await fetchEspDownloadsPage(
          session,
          fromDate,
          toDate,
          1,
          100
        );
        const pages = Math.max(1, Math.ceil(first.totalAssets / 100));
        const items = [...first.items];
        for (let page = 2; page <= pages; page++) {
          const res = await fetchEspDownloadsPage(
            session,
            fromDate,
            toDate,
            page,
            100
          );
          items.push(...res.items);
          if (res.items.length === 0) break;
        }
        for (const item of items) {
          if (!item.MasterId || item.TotalCount <= 0) continue;
          const { mediaType, isIllustration } = mediaKindFromGettyType(
            item.ContentType ?? ''
          );
          if (!metaById.has(item.MasterId)) {
            metaById.set(item.MasterId, {
              id: item.MasterId,
              mediaType,
              isIllustration: isIllustration || undefined,
              headline: '',
              createdAt: item.ApprovalDate
                ? item.ApprovalDate.slice(0, 10)
                : null,
              thumbUrl: item.ThumbnailUrl ?? '',
            });
          }
          const date = item.LastDownloadDate
            ? item.LastDownloadDate.slice(0, 10)
            : fromDate;
          const list = pendingSalesByAsset.get(item.MasterId) ?? [];
          list.push({
            date,
            amount: 0,
            count: item.TotalCount,
            license: 'istock_pending',
          });
          pendingSalesByAsset.set(item.MasterId, list);
        }
        onProgress({ step: 'sales', done: i + 1, total: pendingMonths.length });
      }
    }

    // 4. Build products map from TSV + pending sales
    const productMap = new Map<string, Product>();

    const ensureProduct = (
      id: string,
      mediaType: MediaKind,
      isIllustration: boolean | undefined,
      headline: string
    ): Product => {
      const existing = productMap.get(id);
      if (existing) {
        if (!existing.headline && headline) existing.headline = headline;
        return existing;
      }
      const meta = metaById.get(id);
      const resolvedMediaType = meta?.mediaType ?? mediaType;
      const created: Product = {
        id,
        mediaType: resolvedMediaType,
        ...(meta?.isIllustration || isIllustration
          ? { isIllustration: true }
          : {}),
        headline: meta?.headline || headline,
        createdAt: meta?.createdAt ?? null,
        thumbUrl: meta?.thumbUrl ?? '',
        url: stockAssetUrl('istock', id, resolvedMediaType),
        sales: [],
      };
      productMap.set(id, created);
      return created;
    };

    for (const row of tsvAssetRows) {
      const product = ensureProduct(
        row.mediaId,
        row.mediaType,
        row.uploadDate === 'illustration' || undefined,
        row.headline
      );
      product.sales.push({
        date: row.date,
        amount: row.amount,
        count: row.count,
        license: row.license,
      });

      if (!metaById.has(row.mediaId)) {
        metaById.set(row.mediaId, {
          id: row.mediaId,
          mediaType: row.mediaType,
          isIllustration: row.uploadDate === 'illustration' || undefined,
          headline: row.headline,
          createdAt: null,
          thumbUrl: '',
        });
      } else {
        const meta = metaById.get(row.mediaId)!;
        if (!meta.headline && row.headline) meta.headline = row.headline;
      }
    }

    for (const [id, sales] of pendingSalesByAsset.entries()) {
      const meta = metaById.get(id);
      const product = ensureProduct(
        id,
        meta?.mediaType ?? 'photo',
        meta?.isIllustration,
        meta?.headline ?? ''
      );
      product.sales.push(...sales);
    }

    // 5. Enrich sold products with public ADP URLs from ESP
    const productIds = [...productMap.keys()];
    for (let i = 0; i < productIds.length; i += ADP_CHUNK_SIZE) {
      const chunk = productIds.slice(i, i + ADP_CHUNK_SIZE);
      try {
        const adpUrls = await fetchEspAdpUrls(session, chunk);
        for (const [id, url] of adpUrls.entries()) {
          const prod = productMap.get(id);
          if (prod && url) prod.url = url;
        }
      } catch {
        // Non-fatal: fallback URL is already set.
      }
    }

    // 6. Portfolio & shoots
    const portfolio: PortfolioItem[] = [...metaById.values()].map((m) => ({
      id: m.id,
      mediaType: m.mediaType,
      ...(m.isIllustration ? { isIllustration: true } : {}),
      headline: m.headline,
      createdAt: m.createdAt,
      thumbUrl: m.thumbUrl,
    }));

    const shootMap = new Map<string, string[]>();
    for (const item of portfolio) {
      if (!item.createdAt) continue;
      const list = shootMap.get(item.createdAt) ?? [];
      list.push(item.id);
      shootMap.set(item.createdAt, list);
    }
    const shoots: Shoot[] = [...shootMap.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, photoIds]) => ({
        id: date,
        title: date,
        uploadedAt: date,
        photoIds,
      }));

    const products = [...productMap.values()];
    let totalEarned = 0;
    let totalDownloads = 0;
    for (const p of products) {
      for (const s of p.sales) {
        totalEarned += s.amount;
        totalDownloads += s.count;
      }
    }
    for (const s of otherSales) {
      totalEarned += s.amount;
      totalDownloads += s.count;
    }

    const photoCount = portfolio.filter((p) => p.mediaType === 'photo').length;
    const videoCount = portfolio.filter((p) => p.mediaType === 'video').length;

    return {
      syncedAt: new Date().toISOString(),
      shutterstockTotal: round6(totalEarned),
      shutterstockDownloads: totalDownloads,
      portfolioSize: portfolio.length,
      photoCount,
      videoCount,
      portfolio,
      shoots,
      products,
      otherSales,
    };
  } finally {
    await session.close();
  }
};
