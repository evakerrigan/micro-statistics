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
import { STOCK_NAME_KEYS } from '../utils/combine';
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
  stock: StockId | 'all';
  shoots: ShootStat[];
  licenses?: string[];
  /** When set (on the All tab), shows per-stock columns + lastSale and hides perPhoto. */
  stocks?: StockId[];
  manualShoots?: ManualShoot[];
  onManualShootsChange?: (update: ManualShootsUpdate) => void;
  onMergeShoot?: (source: string, target: string) => void;
  onUnmergeShoot?: (source: string) => void;
  onRenameShoot?: (key: string, title: string) => void;
  readOnly?: boolean;
};

const shootStockOf = (shootKey: string): string => shootKey.split(':')[0] ?? '';

export const ShootsTable = ({
  stock,
  shoots,
  licenses = [],
  stocks,
  manualShoots,
  onManualShootsChange,
  onMergeShoot,
  onUnmergeShoot,
  onRenameShoot,
  readOnly,
}: ShootsTableProps) => {
  const { t } = useI18n();
  const compact = useMediaQuery(COMPACT_QUERY);
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const isAllMode = Boolean(stocks);
  const columns = stocks ?? licenses;
  const formatColumn = stocks
    ? (key: string) =>
        key in STOCK_NAME_KEYS ? t(STOCK_NAME_KEYS[key as StockId]) : key
    : undefined;
  const rowTotals = (s: ShootStat) =>
    stocks ? { [shootStockOf(s.key)]: s.revenue } : s.byLicense;

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
      lastSale: (s) => s.lastSale ?? '',
      ...Object.fromEntries(
        columns.map((l) => [
          `license:${l}`,
          (s: ShootStat) =>
            stocks
              ? shootStockOf(s.key) === l
                ? s.revenue
                : 0
              : (s.byLicense[l] ?? 0),
        ])
      ),
    }),
    [columns, stocks, t]
  );
  const { sorted, sortKey, direction, toggle } = useSort(
    shoots,
    accessors,
    'revenue'
  );
  const header = { sortKey, direction, onSort: toggle };
  const columnCount = 7 + licenseColumnCount(columns, compact);

  if (mobile) {
    return (
      <ShootCards
        stock={stock}
        shoots={sorted}
        allShoots={shoots}
        licenses={columns}
        stocks={stocks}
        manualShoots={manualShoots}
        onManualShootsChange={onManualShootsChange}
        onMergeShoot={onMergeShoot}
        onUnmergeShoot={onUnmergeShoot}
        onRenameShoot={onRenameShoot}
        readOnly={readOnly}
        {...header}
      />
    );
  }

  return (
    <TableWrap>
      <table
        className={`${styles.table} ${isDenseLicenseTable(columns, compact) ? styles.table__dense : ''}`}
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
            {!isAllMode && (
              <SortHeader
                label={t('shoots.col.perPhoto')}
                columnKey="perPhoto"
                numeric
                {...header}
              />
            )}
            <LicenseHeaders
              licenses={columns}
              compact={compact}
              formatLabel={formatColumn}
              {...header}
            />
            {isAllMode && (
              <SortHeader
                label={t('photos.col.lastSale')}
                columnKey="lastSale"
                {...header}
              />
            )}
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
                    <div
                      className={`${styles.table__primary} ${(stock === 'istock' || stock === 'all') && shoot.kind === 'unmatched' ? shootStyles.wipTitle : ''}`}
                    >
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
                  {!isAllMode && (
                    <td className={styles.table__num}>
                      {shoot.revenuePerPhoto === null || isHistoricalOnly(shoot)
                        ? '—'
                        : formatMoney(shoot.revenuePerPhoto)}
                    </td>
                  )}
                  <LicenseCells
                    licenses={columns}
                    byLicense={rowTotals(shoot)}
                    compact={compact}
                    sortKey={sortKey}
                  />
                  {isAllMode && (
                    <td className={styles.table__date}>
                      {formatDate(shoot.lastSale)}
                    </td>
                  )}
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
                        readOnly={readOnly}
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
