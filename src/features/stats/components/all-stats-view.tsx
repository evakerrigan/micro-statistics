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
import { MergedPhotosTable } from './merged-photos-table';
import { MonthsView } from './months-view';
import { YearsView } from './years-view';
import allStyles from './all-stats-view.module.scss';
import styles from './stats-view.module.scss';

type AllStatsViewProps = {
  datasets: Partial<Record<StockId, Dataset>>;
  manualByStock: Partial<Record<StockId, ManualShoot[]>>;
  mergesByStock: Partial<Record<StockId, ShootMerges>>;
  namesByStock: Partial<Record<StockId, ShootNames>>;
};

const TABS: { id: 'months' | 'photos' | 'years'; label: MessageKey }[] = [
  { id: 'months', label: 'tabs.months' },
  { id: 'photos', label: 'tabs.photos' },
  { id: 'years', label: 'tabs.years' },
];

type TabId = (typeof TABS)[number]['id'];

const IMPLEMENTED_STOCKS = new Set<StockId>(['shutterstock', 'adobe']);

export const AllStatsView = ({
  datasets,
  manualByStock,
  mergesByStock,
  namesByStock,
}: AllStatsViewProps) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>('months');
  const assetMatches = useAssetMatches();

  const combined = useMemo(
    () =>
      combineAllStats(datasets, manualByStock, mergesByStock, namesByStock, t),
    [datasets, manualByStock, mergesByStock, namesByStock, t]
  );

  const hashInputs = useMemo(
    () =>
      combined.photoParts.map((p) => ({
        uid: p.uid,
        thumbUrl: p.photo.product.thumbUrl,
      })),
    [combined.photoParts]
  );

  const {
    hashes,
    ready: hashesReady,
    status: hashStatus,
    retry: retryHashes,
  } = useImageHashes(hashInputs, combined.entries.length > 1);

  const mergedPhotos = useMemo(
    () =>
      matchAcrossStocks(
        combined.photoParts,
        hashesReady ? hashes : {},
        assetMatches.ready ? assetMatches.value : { links: [], unlinks: [] }
      ),
    [
      combined.photoParts,
      hashesReady,
      hashes,
      assetMatches.ready,
      assetMatches.value,
    ]
  );

  const entryByStock = new Map(combined.entries.map((e) => [e.stock, e]));
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
                {combined.soldPhotos}
                <span className={styles.tile__of}>
                  {' '}
                  {t('stats.of', { n: combined.publishedPhotos })}
                </span>
              </div>
              {combined.videoCount > 0 && (
                <div className={styles.tile__sub}>
                  {t('stats.portfolioBreakdown', {
                    photos: combined.photoCount,
                    videos: combined.videoCount,
                  })}
                </div>
              )}
            </div>
            <div className={styles.tile}>
              <div className={styles.tile__label}>
                {t('stats.portfolioSuccess')}
              </div>
              <div className={styles.tile__value}>
                {combined.publishedPhotos
                  ? formatPercent(
                      combined.soldPhotos / combined.publishedPhotos
                    )
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
                {combined.revenuePerSoldPhoto === null
                  ? '—'
                  : formatMoney(combined.revenuePerSoldPhoto)}
              </div>
            </div>
            <div className={styles.tile}>
              <div className={styles.tile__label}>
                {t('stats.perPortfolio')}
              </div>
              <div className={styles.tile__value}>
                {combined.revenuePerPortfolioPhoto === null
                  ? '—'
                  : formatMoney(combined.revenuePerPortfolioPhoto)}
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
                  item.id === 'photos' && hashStatus.running
                    ? t('all.matchingTabHint')
                    : undefined
                }
                className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
                onClick={() => setTab(item.id)}
              >
                {t(item.label)}
                {item.id === 'photos' && hashStatus.running && (
                  <span
                    className={allStyles.tabSpinner}
                    aria-label={t('all.matchingTabHint')}
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
