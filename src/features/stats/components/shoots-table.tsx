import { Fragment, useMemo, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import {
  COMPACT_QUERY,
  MOBILE_QUERY,
  useMediaQuery,
} from '@/hooks/use-media-query';
import type { ManualShoot, StockId } from '@/types/stock';
import { formatDate, formatDuration, formatMoney } from '@/utils/format';
import type { ManualShootsUpdate } from '../hooks/use-manual-shoots';
import { type SortAccessors, useSort } from '../hooks/use-sort';
import { uploadedSortKey, type ShootStat } from '../utils/aggregate';
import {
  isDenseLicenseTable,
  licenseColumnCount,
} from '../utils/license-columns';
import {
  formatPartialRevenue,
  isHistoricalOnly,
  revenueHint,
  shootSubtitle,
  shootTitle,
} from '../utils/shoot-labels';
import { LicenseCells, LicenseHeaders } from './license-columns';
import { ShootCards } from './shoot-cards';
import { ShootDetails } from './shoot-details';
import { SortHeader, StackedSortHeader } from './sort-header';
import { StackRow } from './stack-row';
import { TableWrap } from './table-wrap';
import styles from './table.module.scss';
import shootStyles from './shoots-table.module.scss';

type ShootsTableProps = {
  stock: StockId;
  shoots: ShootStat[];
  licenses: string[];
  manualShoots: ManualShoot[];
  onManualShootsChange: (update: ManualShootsUpdate) => void;
  onMergeShoot: (source: string, target: string) => void;
  onUnmergeShoot: (source: string) => void;
  onRenameShoot: (key: string, title: string) => void;
};

export const ShootsTable = ({
  stock,
  shoots,
  licenses,
  manualShoots,
  onManualShootsChange,
  onMergeShoot,
  onUnmergeShoot,
  onRenameShoot,
}: ShootsTableProps) => {
  const { t } = useI18n();
  const compact = useMediaQuery(COMPACT_QUERY);
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const accessors = useMemo<SortAccessors<ShootStat>>(
    () => ({
      title: (s) => shootTitle(s, t),
      createdAt: uploadedSortKey,
      onSale: (s) =>
        s.publishedAt
          ? Date.now() - new Date(s.publishedAt.slice(0, 10)).getTime()
          : -1,
      published: (s) => s.publishedCount ?? -1,
      sold: (s) => s.photos.length,
      sales: (s) => s.salesCount,
      revenue: (s) => s.revenue,
      perPhoto: (s) => s.revenuePerPhoto ?? -1,
      ...Object.fromEntries(
        licenses.map((l) => [
          `license:${l}`,
          (s: ShootStat) => s.byLicense[l] ?? 0,
        ])
      ),
    }),
    [licenses, t]
  );
  const { sorted, sortKey, direction, toggle } = useSort(
    shoots,
    accessors,
    'revenue'
  );
  const header = { sortKey, direction, onSort: toggle };
  const columnCount = 7 + licenseColumnCount(licenses, compact);

  if (mobile) {
    return (
      <ShootCards
        stock={stock}
        shoots={sorted}
        allShoots={shoots}
        licenses={licenses}
        manualShoots={manualShoots}
        onManualShootsChange={onManualShootsChange}
        onMergeShoot={onMergeShoot}
        onUnmergeShoot={onUnmergeShoot}
        onRenameShoot={onRenameShoot}
        {...header}
      />
    );
  }

  return (
    <TableWrap>
      <table
        className={`${styles.table} ${isDenseLicenseTable(licenses, compact) ? styles.table__dense : ''}`}
      >
        <thead>
          <tr>
            <th
              aria-label={t('col.preview')}
              className={styles.table__pinned}
            />
            <SortHeader label={t('col.shoot')} columnKey="title" {...header} />
            <StackedSortHeader
              columns={[
                { label: t('shoots.col.uploaded'), columnKey: 'createdAt' },
                { label: t('shoots.col.onSale'), columnKey: 'onSale' },
              ]}
              className={styles.table__compact}
              {...header}
            />
            <StackedSortHeader
              columns={[
                {
                  label: t(
                    compact
                      ? 'shoots.col.publishedShort'
                      : 'shoots.col.published'
                  ),
                  columnKey: 'published',
                },
                {
                  label: t(
                    compact ? 'shoots.col.soldShort' : 'shoots.col.sold'
                  ),
                  columnKey: 'sold',
                },
              ]}
              numeric
              {...header}
            />
            <SortHeader
              label={t('col.sales')}
              columnKey="sales"
              numeric
              {...header}
            />
            <SortHeader
              label={t('col.revenue')}
              columnKey="revenue"
              numeric
              className={styles.table__revenue}
              {...header}
            />
            <SortHeader
              label={t('shoots.col.perPhoto')}
              columnKey="perPhoto"
              numeric
              {...header}
            />
            <LicenseHeaders licenses={licenses} compact={compact} {...header} />
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columnCount} className={styles.table__empty}>
                {t('shoots.empty')}
              </td>
            </tr>
          )}
          {sorted.map((shoot) => {
            const key = shoot.key;
            const isOpen = openKey === key;
            return (
              <Fragment key={key}>
                <tr
                  className={styles.table__clickable}
                  onClick={() => setOpenKey(isOpen ? null : key)}
                  aria-expanded={isOpen}
                >
                  <td className={styles.table__pinned}>
                    {shoot.thumbUrl ? (
                      <img
                        src={shoot.thumbUrl}
                        alt=""
                        loading="lazy"
                        className={`${styles.table__thumb} ${shoot.photos.length ? '' : styles.table__thumbUnsold}`}
                      />
                    ) : (
                      <div className={styles.table__thumb} />
                    )}
                  </td>
                  <td className={styles.table__titleCell}>
                    <div className={styles.table__primary}>
                      {shootTitle(shoot, t)}
                      {shoot.kind === 'manual' && (
                        <span className={shootStyles.manualBadge}>
                          {t('shoots.badgeManual')}
                        </span>
                      )}
                    </div>
                    <div className={styles.table__secondary}>
                      {shootSubtitle(shoot, t)}
                    </div>
                  </td>
                  <td className={styles.table__compact}>
                    <div className={styles.table__stack}>
                      <span>
                        {formatDate(shoot.uploadedAt ?? shoot.publishedAt)}
                      </span>
                      <span>{formatDuration(shoot.publishedAt)}</span>
                    </div>
                  </td>
                  <td className={styles.table__num}>
                    <div className={styles.table__pairs}>
                      <StackRow
                        label={t('shoots.pair.published')}
                        value={shoot.publishedCount ?? '—'}
                      />
                      <StackRow
                        label={t('shoots.pair.sold')}
                        value={shoot.photos.length}
                      />
                    </div>
                  </td>
                  <td className={styles.table__num}>{shoot.salesCount}</td>
                  <td
                    className={`${styles.table__num} ${styles.table__revenue}`}
                    title={revenueHint(shoot, t)}
                  >
                    {formatPartialRevenue(shoot, formatMoney)}
                  </td>
                  <td className={styles.table__num}>
                    {shoot.revenuePerPhoto === null || isHistoricalOnly(shoot)
                      ? '—'
                      : formatMoney(shoot.revenuePerPhoto)}
                  </td>
                  <LicenseCells
                    licenses={licenses}
                    byLicense={shoot.byLicense}
                    compact={compact}
                    sortKey={sortKey}
                  />
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={columnCount} className={shootStyles.details}>
                      <ShootDetails
                        stock={stock}
                        shoot={shoot}
                        manualShoots={manualShoots}
                        onManualShootsChange={onManualShootsChange}
                        shoots={shoots}
                        onMergeShoot={onMergeShoot}
                        onUnmergeShoot={onUnmergeShoot}
                        onRenameShoot={onRenameShoot}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
};
