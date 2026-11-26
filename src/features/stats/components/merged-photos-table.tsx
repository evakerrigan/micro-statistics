import { Fragment, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/use-i18n';
import {
  COMPACT_QUERY,
  MOBILE_QUERY,
  useMediaQuery,
} from '@/hooks/use-media-query';
import type { ImageFingerprint, MediaKind, StockId } from '@/types/stock';
import { formatDate, formatMoney } from '@/utils/format';
import type { HashStatus } from '../hooks/use-image-hashes';
import { type SortAccessors, useSort } from '../hooks/use-sort';
import { STOCK_NAME_KEYS } from '../utils/combine';
import {
  isDenseLicenseTable,
  licenseColumnCount,
  licenseSortKey,
} from '../utils/license-columns';
import {
  type MergedPhotoStat,
  suggestLinkCandidates,
} from '../utils/match-assets';
import {
  formatPartialRevenue,
  formatSoldMeta,
  isHistoricalOnly,
  revenueHint,
} from '../utils/shoot-labels';
import { CardStat, RevenueBox } from './card-stat';
import { LicenseCells, LicenseHeaders } from './license-columns';
import { SortBar } from './sort-bar';
import { SortHeader } from './sort-header';
import { TableWrap } from './table-wrap';
import cardStyles from './cards.module.scss';
import photoStyles from './photos-table.module.scss';
import shootStyles from './shoots-table.module.scss';
import styles from './table.module.scss';

type MergedPhotosTableProps = {
  rows: MergedPhotoStat[];
  stocks: StockId[];
  hashes: Record<string, ImageFingerprint>;
  hashStatus: HashStatus;
  onRetryHashes: () => void;
  onLinkAssets: (uidA: string, uidB: string) => void;
  onUnlinkGroup: (uids: string[]) => void;
};

type MediaFilter = 'all' | MediaKind;

const DoneCheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    className={photoStyles.hashDoneIcon}
  >
    <path
      d="M3.2 8.4 6.5 11.7 13 4.5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const MergedPhotosTable = ({
  rows,
  stocks,
  hashes,
  hashStatus,
  onRetryHashes,
  onLinkAssets,
  onUnlinkGroup,
}: MergedPhotosTableProps) => {
  const { t } = useI18n();
  const compact = useMediaQuery(COMPACT_QUERY);
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [query, setQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [openUid, setOpenUid] = useState<string | null>(null);

  const stockLabel = (key: string) =>
    key in STOCK_NAME_KEYS ? t(STOCK_NAME_KEYS[key as StockId]) : key;

  const hasVideos = useMemo(
    () => rows.some((r) => r.primary.photo.product.mediaType === 'video'),
    [rows]
  );

  const matchedCount = useMemo(
    () => rows.filter((r) => r.parts.length > 1).length,
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        mediaFilter !== 'all' &&
        r.primary.photo.product.mediaType !== mediaFilter
      ) {
        return false;
      }
      if (!q) return true;
      return r.parts.some((p) =>
        [p.photo.product.id, p.photo.product.headline, p.shootLabel].some(
          (field) => field.toLowerCase().includes(q)
        )
      );
    });
  }, [rows, query, mediaFilter]);

  const accessors = useMemo<SortAccessors<MergedPhotoStat>>(
    () => ({
      id: (r) => r.primary.photo.product.id,
      shoot: (r) => r.primary.shootLabel,
      sales: (r) => r.salesCount,
      revenue: (r) => r.revenue,
      lastSale: (r) => r.lastSale ?? '',
      ...Object.fromEntries(
        stocks.map((s) => [
          licenseSortKey(s),
          (r: MergedPhotoStat) => r.byStock[s] ?? 0,
        ])
      ),
    }),
    [stocks]
  );

  const { sorted, sortKey, direction, toggle } = useSort(
    filtered,
    accessors,
    'revenue'
  );
  const header = { sortKey, direction, onSort: toggle };
  const columnCount = 6 + licenseColumnCount(stocks, compact);

  const filterButtons: { id: MediaFilter; label: string }[] = [
    { id: 'all', label: t('media.all') },
    { id: 'photo', label: t('media.photos') },
    { id: 'video', label: t('media.videos') },
  ];

  const emptyText =
    query || mediaFilter !== 'all'
      ? t('details.nothingFound')
      : t('photos.empty');

  const sortOptions = [
    { label: t('col.revenue'), columnKey: 'revenue' },
    { label: t('col.sales'), columnKey: 'sales' },
    { label: t('photos.col.lastSale'), columnKey: 'lastSale' },
    { label: t('photos.col.photo'), columnKey: 'id' },
    { label: t('col.shoot'), columnKey: 'shoot' },
    ...stocks.map((s) => ({
      label: stockLabel(s),
      columnKey: licenseSortKey(s),
    })),
  ];

  return (
    <>
      <div className={photoStyles.toolbar}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('photos.search')}
          className={photoStyles.search}
        />
        {hasVideos && (
          <div className={photoStyles.filters} role="group">
            {filterButtons.map((btn) => (
              <button
                key={btn.id}
                type="button"
                className={`${photoStyles.filter} ${mediaFilter === btn.id ? photoStyles.filterActive : ''}`}
                aria-pressed={mediaFilter === btn.id}
                onClick={() => setMediaFilter(btn.id)}
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
        {stocks.length > 1 && (
          <span className={photoStyles.hashStatus} role="status">
            {hashStatus.running ? (
              <>
                <span className={photoStyles.hashSpinner} aria-hidden="true" />
                {hashStatus.total > 0
                  ? t('all.matchingProgress', {
                      done: hashStatus.done,
                      total: hashStatus.total,
                    })
                  : t('sync.loading')}
              </>
            ) : (
              <>
                <DoneCheckIcon />
                {matchedCount > 0
                  ? t('all.matchedCount', { n: matchedCount })
                  : t('all.matchingDoneNone')}
                {hashStatus.failed > 0 && (
                  <>
                    {' · '}
                    {t('all.matchingPartial', { n: hashStatus.failed })}
                    <button
                      type="button"
                      className={photoStyles.hashRetry}
                      onClick={onRetryHashes}
                    >
                      {t('all.matchingRetry')}
                    </button>
                  </>
                )}
              </>
            )}
          </span>
        )}
      </div>

      {mobile ? (
        <>
          <SortBar
            options={sortOptions}
            sortKey={sortKey}
            direction={direction}
            onSort={toggle}
          />
          {sorted.length === 0 && (
            <p className={styles.table__empty}>{emptyText}</p>
          )}
          <div className={cardStyles.cards}>
            {sorted.map((row) => {
              const isOpen = openUid === row.uid;
              return (
                <article key={row.uid} className={cardStyles.card}>
                  <div
                    className={cardStyles.card__clickable}
                    onClick={() => setOpenUid(isOpen ? null : row.uid)}
                    aria-expanded={isOpen}
                  >
                    <div className={cardStyles.card__head}>
                      <img
                        src={row.primary.photo.product.thumbUrl}
                        alt=""
                        loading="lazy"
                        className={styles.table__thumb}
                      />
                      <div className={cardStyles.card__text}>
                        <div className={photoStyles.partLinks}>
                          {row.parts.map((part) => (
                            <span key={part.uid}>
                              {row.parts.length > 1 && (
                                <span className={photoStyles.partTag}>
                                  {stockLabel(part.stock)}:
                                </span>
                              )}
                              <a
                                href={part.photo.product.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={`${styles.table__primary} ${styles.table__link}`}
                              >
                                {part.photo.product.id}
                              </a>
                            </span>
                          ))}
                          {row.primary.photo.product.mediaType === 'video' && (
                            <span className={photoStyles.videoBadge}>
                              {t('media.videoBadge')}
                            </span>
                          )}
                        </div>
                        <div className={styles.table__secondary}>
                          {row.primary.photo.product.headline}
                        </div>
                      </div>
                      <RevenueBox
                        label={t('col.revenue')}
                        value={
                          row.parts.every((p) => isHistoricalOnly(p.photo))
                            ? '—'
                            : formatMoney(row.revenue)
                        }
                        highlighted={sortKey === 'revenue'}
                      />
                    </div>
                    <div className={cardStyles.card__stats}>
                      <CardStat
                        label={t('col.sales')}
                        value={row.salesCount}
                        highlighted={sortKey === 'sales'}
                      />
                      <CardStat
                        label={t('photos.col.lastSale')}
                        value={formatDate(row.lastSale)}
                        highlighted={sortKey === 'lastSale'}
                      />
                      <CardStat
                        label={t('col.shoot')}
                        value={row.parts.map((p) => p.shootLabel).join(' · ')}
                        highlighted={sortKey === 'shoot'}
                      />
                    </div>
                    {stocks.length > 0 && (
                      <div
                        className={`${cardStyles.card__stats} ${cardStyles.card__partners}`}
                      >
                        {stocks.map((s) => (
                          <CardStat
                            key={s}
                            label={stockLabel(s)}
                            value={
                              row.byStock[s] ? formatMoney(row.byStock[s]) : '—'
                            }
                            highlighted={sortKey === licenseSortKey(s)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  {isOpen && (
                    <div className={cardStyles.card__details}>
                      <MatchRowDetails
                        row={row}
                        allRows={rows}
                        hashes={hashes}
                        stockLabel={stockLabel}
                        onLinkAssets={onLinkAssets}
                        onUnlinkGroup={onUnlinkGroup}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <TableWrap>
          <table
            className={`${styles.table} ${isDenseLicenseTable(stocks, compact) ? styles.table__dense : ''}`}
          >
            <thead>
              <tr>
                <th
                  aria-label={t('col.preview')}
                  className={styles.table__pinned}
                />
                <SortHeader
                  label={t('photos.col.photo')}
                  columnKey="id"
                  {...header}
                />
                <SortHeader
                  label={t('col.shoot')}
                  columnKey="shoot"
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
                <LicenseHeaders
                  licenses={stocks}
                  compact={compact}
                  formatLabel={stockLabel}
                  {...header}
                />
                <SortHeader
                  label={t('photos.col.lastSale')}
                  columnKey="lastSale"
                  numeric
                  {...header}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={columnCount} className={styles.table__empty}>
                    {emptyText}
                  </td>
                </tr>
              )}
              {sorted.map((row) => {
                const isOpen = openUid === row.uid;
                return (
                  <Fragment key={row.uid}>
                    <tr
                      className={styles.table__clickable}
                      onClick={() => setOpenUid(isOpen ? null : row.uid)}
                      aria-expanded={isOpen}
                    >
                      <td className={styles.table__pinned}>
                        <img
                          src={row.primary.photo.product.thumbUrl}
                          alt=""
                          loading="lazy"
                          className={styles.table__thumb}
                        />
                      </td>
                      <td
                        className={`${photoStyles.photoCell} ${styles.table__titleCell}`}
                      >
                        <div className={photoStyles.partLinks}>
                          {row.parts.map((part) => (
                            <span key={part.uid}>
                              {row.parts.length > 1 && (
                                <span className={photoStyles.partTag}>
                                  {stockLabel(part.stock)}:
                                </span>
                              )}
                              <a
                                href={part.photo.product.url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className={`${styles.table__primary} ${styles.table__link}`}
                              >
                                {part.photo.product.id}
                              </a>
                            </span>
                          ))}
                          {row.primary.photo.product.mediaType === 'video' && (
                            <span className={photoStyles.videoBadge}>
                              {t('media.videoBadge')}
                            </span>
                          )}
                        </div>
                        <div className={styles.table__secondary}>
                          {row.primary.photo.product.headline}
                        </div>
                      </td>
                      <td>
                        <div className={photoStyles.shootList}>
                          {row.parts.map((part) => (
                            <span key={part.uid}>{part.shootLabel}</span>
                          ))}
                        </div>
                      </td>
                      <td className={styles.table__num}>{row.salesCount}</td>
                      <td
                        className={`${styles.table__num} ${styles.table__revenue}`}
                      >
                        {row.parts.every((p) => isHistoricalOnly(p.photo))
                          ? '—'
                          : formatMoney(row.revenue)}
                      </td>
                      <LicenseCells
                        licenses={stocks}
                        byLicense={row.byStock}
                        compact={compact}
                        sortKey={sortKey}
                        formatLabel={stockLabel}
                      />
                      <td className={styles.table__num}>
                        {formatDate(row.lastSale)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td
                          colSpan={columnCount}
                          className={shootStyles.details}
                        >
                          <MatchRowDetails
                            row={row}
                            allRows={rows}
                            hashes={hashes}
                            stockLabel={stockLabel}
                            onLinkAssets={onLinkAssets}
                            onUnlinkGroup={onUnlinkGroup}
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
      )}
    </>
  );
};

type MatchRowDetailsProps = {
  row: MergedPhotoStat;
  allRows: MergedPhotoStat[];
  hashes: Record<string, ImageFingerprint>;
  stockLabel: (stock: string) => string;
  onLinkAssets: (uidA: string, uidB: string) => void;
  onUnlinkGroup: (uids: string[]) => void;
};

const MatchRowDetails = ({
  row,
  allRows,
  hashes,
  stockLabel,
  onLinkAssets,
  onUnlinkGroup,
}: MatchRowDetailsProps) => {
  const { t } = useI18n();
  const [candidateUid, setCandidateUid] = useState('');

  const candidates = useMemo(
    () => suggestLinkCandidates(row, allRows, hashes).slice(0, 60),
    [row, allRows, hashes]
  );

  return (
    <div className={photoStyles.matchDetails}>
      <div className={photoStyles.matchParts}>
        {row.parts.map((part) => (
          <div key={part.uid} className={photoStyles.matchPart}>
            <img
              src={part.photo.product.thumbUrl}
              alt=""
              className={styles.table__thumb}
            />
            <div>
              <div>
                <strong>{stockLabel(part.stock)}</strong> ·{' '}
                <a
                  href={part.photo.product.url}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.table__link}
                >
                  {part.photo.product.id}
                </a>
              </div>
              <div
                className={styles.table__secondary}
                title={revenueHint(part.photo, t)}
              >
                {formatPartialRevenue(part.photo, formatMoney)} ·{' '}
                {formatSoldMeta(part.photo, t, formatDate)}
              </div>
              <div className={styles.table__secondary}>{part.shootLabel}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={photoStyles.matchToolbar}>
        {row.parts.length > 1 && (
          <Button
            variant="secondary"
            onClick={() => onUnlinkGroup(row.parts.map((p) => p.uid))}
          >
            {t('all.unlinkFile')}
          </Button>
        )}
        {candidates.length > 0 && (
          <>
            <select
              value={candidateUid}
              onChange={(e) => setCandidateUid(e.target.value)}
              aria-label={t('all.linkFileLabel')}
              className={photoStyles.matchSelect}
            >
              <option value="">{t('all.linkPlaceholder')}</option>
              {candidates.map((c) => (
                <option key={c.uid} value={c.primary.uid}>
                  {stockLabel(c.primary.stock)} · {c.primary.photo.product.id} ·{' '}
                  {formatMoney(c.revenue)} ·{' '}
                  {c.primary.photo.product.headline.slice(0, 55)}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              disabled={!candidateUid}
              onClick={() => {
                onLinkAssets(row.primary.uid, candidateUid);
                setCandidateUid('');
              }}
            >
              {t('all.linkFile')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
