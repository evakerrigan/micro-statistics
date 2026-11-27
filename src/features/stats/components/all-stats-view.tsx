import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/hooks/use-i18n';
import type { MessageKey } from '@/lib/i18n';
import {
  type Dataset,
  type ManualShoot,
  type ShootMerges,
  type ShootNames,
  STOCK_IDS,
  type StockId,
} from '@/types/stock';
import { formatDate, formatMoney, formatPercent } from '@/utils/format';
import { useAssetMatches } from '../hooks/use-asset-matches';
import { useImageHashes } from '../hooks/use-image-hashes';
import { combineAllStats, STOCK_NAME_KEYS } from '../utils/combine';
import { matchAcrossStocks } from '../utils/match-assets';
import { licenseLabel } from '../utils/shoot-labels';
import {
  buildSimilarityShoots,
  collectHashInputs,
} from '../utils/similarity-shoots';
import { buildYears, countCalendarYears } from '../utils/years';
import { MergedPhotosTable } from './merged-photos-table';
import { MonthsView } from './months-view';
import { ShootsTable } from './shoots-table';
import { YearsView } from './years-view';
import allStyles from './all-stats-view.module.scss';
import styles from './stats-view.module.scss';

type AllStatsViewProps = {
  datasets: Partial<Record<StockId, Dataset>>;
  manualByStock: Partial<Record<StockId, ManualShoot[]>>;
  mergesByStock: Partial<Record<StockId, ShootMerges>>;
  namesByStock: Partial<Record<StockId, ShootNames>>;
};

const TABS: {
  id: 'shoots' | 'photos' | 'months' | 'years';
  label: MessageKey;
}[] = [
  { id: 'photos', label: 'tabs.photos' },
  { id: 'shoots', label: 'tabs.shoots' },
  { id: 'months', label: 'tabs.months' },
  { id: 'years', label: 'tabs.years' },
];

type TabId = (typeof TABS)[number]['id'];

const IMPLEMENTED_STOCKS = new Set<StockId>([
  'shutterstock',
  'adobe',
  'istock',
]);

export const AllStatsView = ({
  datasets,
  manualByStock,
  mergesByStock,
  namesByStock,
}: AllStatsViewProps) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>('photos');
  const assetMatches = useAssetMatches();

  const hashInputs = useMemo(
    () =>
      STOCK_IDS.flatMap((stock) => {
        const ds = datasets[stock];
        return ds ? collectHashInputs(ds, stock) : [];
      }),
    [datasets]
  );

  const {
    hashes,
    ready: hashesReady,
    status: hashStatus,
    retry: retryHashes,
  } = useImageHashes(hashInputs, hashInputs.length > 0);

  const effectiveDatasets = useMemo(() => {
    const activeHashes = hashesReady ? hashes : {};
    const next: Partial<Record<StockId, Dataset>> = {};
    for (const stock of STOCK_IDS) {
      const ds = datasets[stock];
      if (!ds) continue;
      next[stock] = {
        ...ds,
        shoots: buildSimilarityShoots(ds, activeHashes, stock),
      };
    }
    return next;
  }, [datasets, hashesReady, hashes]);

  const combined = useMemo(
    () =>
      combineAllStats(
        effectiveDatasets,
        manualByStock,
        mergesByStock,
        namesByStock,
        t
      ),
    [effectiveDatasets, manualByStock, mergesByStock, namesByStock, t]
  );

  const allMerged = useMemo(
    () =>
      matchAcrossStocks(
        combined.allParts,
        hashesReady ? hashes : {},
        assetMatches.ready ? assetMatches.value : { links: [], unlinks: [] }
      ),
    [
      combined.allParts,
      hashesReady,
      hashes,
      assetMatches.ready,
      assetMatches.value,
    ]
  );

  const mergedPhotos = useMemo(
    () => allMerged.filter((g) => g.salesCount > 0 || g.revenue > 0),
    [allMerged]
  );

  const deduped = useMemo(() => {
    const publishedPhotos = allMerged.length;
    const soldPhotos = allMerged.filter(
      (g) => g.salesCount > 0 || g.revenue > 0
    ).length;
    const photoCount = allMerged.filter(
      (g) => g.primary.photo.product.mediaType === 'photo'
    ).length;
    const videoCount = allMerged.filter(
      (g) => g.primary.photo.product.mediaType === 'video'
    ).length;
    const r = (n: number) => Math.round(n * 10000) / 10000;
    return {
      publishedPhotos,
      soldPhotos,
      photoCount,
      videoCount,
      revenuePerSoldPhoto: soldPhotos ? r(combined.revenue / soldPhotos) : null,
      revenuePerPortfolioPhoto: publishedPhotos
        ? r(combined.revenue / publishedPhotos)
        : null,
    };
  }, [allMerged, combined.revenue]);

  const entryByStock = new Map(combined.entries.map((e) => [e.stock, e]));
  const yearsCount = useMemo(
    () => buildYears(combined.shoots).length,
    [combined.shoots]
  );
  const tabCounts: Record<TabId, string | number> = {
    photos: deduped.publishedPhotos
      ? `${mergedPhotos.length}/${deduped.publishedPhotos}`
      : mergedPhotos.length,
    shoots: combined.shoots.length,
    months: `${countCalendarYears(combined.months)}/${combined.months.length}`,
    years: yearsCount,
  };
  const stockLabel = (key: string) =>
    key in STOCK_NAME_KEYS ? t(STOCK_NAME_KEYS[key as StockId]) : key;

  return (
    <div className={styles.stats}>
      <h2 className={styles.sectionTitle}>{t('all.stocksTitle')}</h2>
      <div className={allStyles.stockCards}>
        {STOCK_IDS.map((stock) => {
          const entry = entryByStock.get(stock);
          const ready = IMPLEMENTED_STOCKS.has(stock);
          return (
            <Link key={stock} to={`/${stock}`} className={allStyles.stockCard}>
              <div className={allStyles.stockCard__head}>
                <span className={allStyles.stockCard__name}>
                  {t(STOCK_NAME_KEYS[stock])}
                </span>
                <span className={allStyles.stockCard__status}>
                  {entry
                    ? formatDate(entry.dataset.syncedAt)
                    : ready
                      ? t('all.notSynced')
                      : t('all.comingSoon')}
                </span>
              </div>
              {entry ? (
                <>
                  <div className={allStyles.stockCard__value}>
                    {formatMoney(entry.stats.revenue)}
                  </div>
                  <div className={allStyles.stockCard__meta}>
                    {t('all.stockSummary', {
                      sales: entry.stats.salesCount,
                      sold: entry.stats.soldPhotos,
                      total: entry.stats.publishedPhotos,
                    })}
                  </div>
                </>
              ) : (
                <div className={allStyles.stockCard__meta}>
                  {ready ? t('all.openToSync') : t('all.soonHint')}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {combined.entries.length === 0 ? (
        <div className={allStyles.empty}>
          <p>{t('all.empty')}</p>
        </div>
      ) : (
        <>
          <h2 className={styles.sectionTitle}>{t('stats.overviewTitle')}</h2>
          <div className={styles.tiles}>
            <div className={styles.tile}>
              <div className={styles.tile__label}>{t('stats.earned')}</div>
              <div className={`${styles.tile__value} ${styles.tile__hero}`}>
                {formatMoney(combined.revenue)}
              </div>
            </div>
            <div className={styles.tile}>
              <div className={styles.tile__label}>{t('stats.sales')}</div>
              <div className={styles.tile__value}>{combined.salesCount}</div>
            </div>
            <div className={styles.tile}>
              <div className={styles.tile__label}>{t('stats.soldPhotos')}</div>
              <div className={styles.tile__value}>
                {deduped.soldPhotos}
                <span className={styles.tile__of}>
                  {' '}
                  {t('stats.of', { n: deduped.publishedPhotos })}
                </span>
              </div>
              {deduped.videoCount > 0 && (
                <div className={styles.tile__sub}>
                  {t('stats.portfolioBreakdown', {
                    photos: deduped.photoCount,
                    videos: deduped.videoCount,
                  })}
                </div>
              )}
            </div>
            <div className={styles.tile}>
              <div className={styles.tile__label}>
                {t('stats.portfolioSuccess')}
              </div>
              <div className={styles.tile__value}>
                {deduped.publishedPhotos
                  ? formatPercent(deduped.soldPhotos / deduped.publishedPhotos)
                  : '—'}
              </div>
            </div>
            <div className={styles.tile}>
              <div className={styles.tile__label}>{t('stats.shoots')}</div>
              <div className={styles.tile__value}>{combined.shootsCount}</div>
            </div>
            <div className={styles.tile}>
              <div className={styles.tile__label}>{t('stats.perSold')}</div>
              <div className={styles.tile__value}>
                {deduped.revenuePerSoldPhoto === null
                  ? '—'
                  : formatMoney(deduped.revenuePerSoldPhoto)}
              </div>
            </div>
            <div className={styles.tile}>
              <div className={styles.tile__label}>
                {t('stats.perPortfolio')}
              </div>
              <div className={styles.tile__value}>
                {deduped.revenuePerPortfolioPhoto === null
                  ? '—'
                  : formatMoney(deduped.revenuePerPortfolioPhoto)}
              </div>
            </div>
          </div>

          <h2 className={styles.sectionTitle}>{t('stats.licensesTitle')}</h2>
          <div className={styles.tiles}>
            {combined.licenses.map((l) => (
              <div key={l} className={styles.tile}>
                <div className={styles.tile__label}>{licenseLabel(l, t)}</div>
                <div className={styles.tile__value}>
                  {formatMoney(combined.byLicense[l] ?? 0)}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.tabs} role="tablist">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                title={
                  (item.id === 'photos' || item.id === 'shoots') &&
                  hashStatus.running
                    ? t(
                        item.id === 'photos'
                          ? 'all.matchingTabHint'
                          : 'stats.matchingShootsHint'
                      )
                    : undefined
                }
                className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
                onClick={() => setTab(item.id)}
              >
                {t(item.label)}{' '}
                <span className={styles.tabCount}>({tabCounts[item.id]})</span>
                {(item.id === 'photos' || item.id === 'shoots') &&
                  hashStatus.running && (
                    <span
                      className={allStyles.tabSpinner}
                      aria-label={t(
                        item.id === 'photos'
                          ? 'all.matchingTabHint'
                          : 'stats.matchingShootsHint'
                      )}
                    />
                  )}
              </button>
            ))}
          </div>

          {tab === 'months' && (
            <MonthsView
              months={combined.months}
              licenses={combined.activeStocks}
              portfolioDates={combined.portfolioDates}
              formatColumn={stockLabel}
            />
          )}
          {tab === 'shoots' && (
            <ShootsTable
              stock="all"
              shoots={combined.shoots}
              stocks={combined.activeStocks}
              readOnly
            />
          )}
          {tab === 'photos' && (
            <MergedPhotosTable
              rows={mergedPhotos}
              stocks={combined.activeStocks}
              hashes={hashes}
              hashStatus={hashStatus}
              onRetryHashes={retryHashes}
              onLinkAssets={assetMatches.linkAssets}
              onUnlinkGroup={assetMatches.unlinkGroup}
            />
          )}
          {tab === 'years' && (
            <YearsView shoots={combined.shoots} scope="all" />
          )}
        </>
      )}
    </div>
  );
};
