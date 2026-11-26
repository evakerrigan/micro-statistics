import { useMemo, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import type { MessageKey } from '@/lib/i18n';
import type { Dataset, StockId } from '@/types/stock';
import { formatMoney, formatPercent } from '@/utils/format';
import { useManualShoots } from '../hooks/use-manual-shoots';
import { useShootMerges } from '../hooks/use-shoot-merges';
import { useShootNames } from '../hooks/use-shoot-names';
import { buildStats } from '../utils/aggregate';
import { STOCK_NAME_KEYS } from '../utils/combine';
import { licenseLabel } from '../utils/shoot-labels';
import { MonthsView } from './months-view';
import { PhotosTable } from './photos-table';
import { ShootsTable } from './shoots-table';
import styles from './stats-view.module.scss';
import { YearsView } from './years-view';

type StatsViewProps = {
  stock?: StockId;
  dataset: Dataset;
};

const TABS: {
  id: 'shoots' | 'photos' | 'months' | 'years';
  label: MessageKey;
}[] = [
  { id: 'shoots', label: 'tabs.shoots' },
  { id: 'photos', label: 'tabs.photos' },
  { id: 'months', label: 'tabs.months' },
  { id: 'years', label: 'tabs.years' },
];

type TabId = (typeof TABS)[number]['id'];

export const StatsView = ({
  stock = 'shutterstock',
  dataset,
}: StatsViewProps) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>('shoots');
  const manual = useManualShoots(stock);
  const merges = useShootMerges(stock);
  const shootNames = useShootNames(stock);
  const stats = useMemo(
    () =>
      buildStats(dataset, manual.value, merges.value, shootNames.value, stock),
    [dataset, manual.value, merges.value, shootNames.value, stock]
  );
  const ready = manual.ready && merges.ready && shootNames.ready;

  // Wait for user customizations, so «No shoot» or old names don't flash on load.
  if (!ready) return null;

  const missing =
    Math.round((stats.shutterstockTotal - stats.revenue) * 100) / 100;
  const matchedShoots = stats.shoots.filter((s) => s.kind !== 'unmatched');
  const unmatched = stats.shoots.find((s) => s.kind === 'unmatched');

  return (
    <div className={styles.stats}>
      <h2 className={styles.sectionTitle}>{t('stats.overviewTitle')}</h2>
      <div className={styles.tiles}>
        <div className={styles.tile}>
          <div className={styles.tile__label}>{t('stats.earned')}</div>
          <div className={`${styles.tile__value} ${styles.tile__hero}`}>
            {formatMoney(stats.revenue)}
          </div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tile__label}>{t('stats.sales')}</div>
          <div className={styles.tile__value}>{stats.salesCount}</div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tile__label}>{t('stats.soldPhotos')}</div>
          <div className={styles.tile__value}>
            {stats.soldPhotos}
            <span className={styles.tile__of}>
              {' '}
              {t('stats.of', { n: stats.publishedPhotos })}
            </span>
          </div>
          {stats.videoCount > 0 && (
            <div className={styles.tile__sub}>
              {t('stats.portfolioBreakdown', {
                photos: stats.photoCount,
                videos: stats.videoCount,
              })}
            </div>
          )}
        </div>
        <div className={styles.tile}>
          <div className={styles.tile__label}>
            {t('stats.portfolioSuccess')}
          </div>
          <div className={styles.tile__value}>
            {stats.publishedPhotos
              ? formatPercent(stats.soldPhotos / stats.publishedPhotos)
              : '—'}
          </div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tile__label}>{t('stats.shoots')}</div>
          <div className={styles.tile__value}>{matchedShoots.length}</div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tile__label}>{t('stats.perSold')}</div>
          <div className={styles.tile__value}>
            {stats.revenuePerSoldPhoto === null
              ? '—'
              : formatMoney(stats.revenuePerSoldPhoto)}
          </div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tile__label}>{t('stats.perPortfolio')}</div>
          <div className={styles.tile__value}>
            {stats.revenuePerPortfolioPhoto === null
              ? '—'
              : formatMoney(stats.revenuePerPortfolioPhoto)}
          </div>
        </div>
      </div>

      <h2 className={styles.sectionTitle}>{t('stats.licensesTitle')}</h2>
      <div className={styles.tiles}>
        {stats.licenses.map((l) => (
          <div key={l} className={styles.tile}>
            <div className={styles.tile__label}>{licenseLabel(l, t)}</div>
            <div className={styles.tile__value}>
              {formatMoney(
                stats.months.reduce((sum, m) => sum + (m.byLicense[l] ?? 0), 0)
              )}
            </div>
          </div>
        ))}
      </div>

      {Math.abs(missing) >= 0.02 && (
        <p className={styles.notice}>
          {t('stats.mismatch', {
            stock: t(STOCK_NAME_KEYS[stock]),
            total: formatMoney(stats.shutterstockTotal),
            collected: formatMoney(stats.revenue),
            diff: formatMoney(missing),
          })}
        </p>
      )}
      {stock === 'adobe' && stats.historicalOnly && (
        <p className={styles.notice}>
          {t('stats.adobeHistorical', {
            count: stats.historicalOnly.count,
            amount: formatMoney(stats.historicalOnly.amount),
          })}
        </p>
      )}
      {unmatched && unmatched.photos.length > 0 && (
        <p className={styles.notice}>
          {t('stats.unmatched', {
            count: unmatched.photos.length,
            amount: formatMoney(unmatched.revenue),
          })}
        </p>
      )}

      <div className={styles.tabs} role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`${styles.tab} ${tab === item.id ? styles.tabActive : ''}`}
            onClick={() => setTab(item.id)}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {tab === 'shoots' && (
        <ShootsTable
          stock={stock}
          shoots={stats.shoots}
          licenses={stats.assetLicenses}
          manualShoots={manual.value}
          onManualShootsChange={manual.update}
          onMergeShoot={merges.merge}
          onUnmergeShoot={merges.unmerge}
          onRenameShoot={shootNames.rename}
        />
      )}
      {tab === 'photos' && (
        <PhotosTable
          photos={stats.photos}
          shoots={stats.shoots}
          licenses={stats.assetLicenses}
        />
      )}
      {tab === 'months' && (
        <MonthsView
          months={stats.months}
          licenses={stats.licenses}
          portfolioDates={stats.portfolioDates}
        />
      )}
      {tab === 'years' && <YearsView shoots={stats.shoots} scope={stock} />}
    </div>
  );
};
