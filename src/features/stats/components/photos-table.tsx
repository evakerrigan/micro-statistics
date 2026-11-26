import { useMemo, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import {
  COMPACT_QUERY,
  MOBILE_QUERY,
  useMediaQuery,
} from '@/hooks/use-media-query';
import type { MediaKind } from '@/types/shutterstock';
import { formatDate, formatMoney } from '@/utils/format';
import { type SortAccessors, useSort } from '../hooks/use-sort';
import {
  type PhotoStat,
  type ShootStat,
  UNMATCHED_KEY,
} from '../utils/aggregate';
import {
  isDenseLicenseTable,
  licenseColumnCount,
} from '../utils/license-columns';
import {
  formatPartialRevenue,
  revenueHint,
  shootTitle,
} from '../utils/shoot-labels';
import { LicenseCells, LicenseHeaders } from './license-columns';
import { PhotoCards } from './photo-cards';
import { SortHeader } from './sort-header';
import { TableWrap } from './table-wrap';
import styles from './table.module.scss';
import photoStyles from './photos-table.module.scss';

type PhotosTableProps = {
  photos: PhotoStat[];
  shoots: ShootStat[];
  licenses: string[];
};

type MediaFilter = 'all' | MediaKind;

export const PhotosTable = ({ photos, shoots, licenses }: PhotosTableProps) => {
  const { t } = useI18n();
  const compact = useMediaQuery(COMPACT_QUERY);
  const mobile = useMediaQuery(MOBILE_QUERY);
  const [query, setQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');

  const hasVideos = useMemo(
    () => photos.some((p) => p.product.mediaType === 'video'),
    [photos]
  );

  const shootTitles = useMemo(
    () => new Map(shoots.map((s) => [s.key, shootTitle(s, t)])),
    [shoots, t]
  );
  const titleOf = (photo: PhotoStat) =>
    shootTitles.get(photo.shootKey ?? UNMATCHED_KEY) ?? '—';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return photos.filter((p) => {
      if (mediaFilter !== 'all' && p.product.mediaType !== mediaFilter) {
        return false;
      }
      if (!q) return true;
      return [
        p.product.id,
        p.product.headline,
        shootTitles.get(p.shootKey ?? UNMATCHED_KEY) ?? '',
      ].some((field) => field.toLowerCase().includes(q));
    });
  }, [photos, query, mediaFilter, shootTitles]);

  const accessors = useMemo<SortAccessors<PhotoStat>>(
    () => ({
      id: (p) => p.product.id,
      shoot: (p) => shootTitles.get(p.shootKey ?? UNMATCHED_KEY) ?? '',
      sales: (p) => p.salesCount,
      revenue: (p) => p.revenue,
      lastSale: (p) => p.lastSale ?? '',
      ...Object.fromEntries(
        licenses.map((name) => [
          `license:${name}`,
          (p: PhotoStat) => p.byLicense[name] ?? 0,
        ])
      ),
    }),
    [licenses, shootTitles]
  );
  const { sorted, sortKey, direction, toggle } = useSort(
    filtered,
    accessors,
    'revenue'
  );
  const header = { sortKey, direction, onSort: toggle };

  const filterButtons: { id: MediaFilter; label: string }[] = [
    { id: 'all', label: t('media.all') },
    { id: 'photo', label: t('media.photos') },
    { id: 'video', label: t('media.videos') },
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
      </div>

      {mobile ? (
        <PhotoCards
          photos={sorted}
          licenses={licenses}
          shootTitleOf={titleOf}
          emptyText={
            query || mediaFilter !== 'all'
              ? t('details.nothingFound')
              : t('photos.empty')
          }
          {...header}
        />
      ) : (
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
                  licenses={licenses}
                  compact={compact}
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
                  <td
                    colSpan={6 + licenseColumnCount(licenses, compact)}
                    className={styles.table__empty}
                  >
                    {query || mediaFilter !== 'all'
                      ? t('details.nothingFound')
                      : t('photos.empty')}
                  </td>
                </tr>
              )}
              {sorted.map((photo) => (
                <tr key={photo.uid ?? photo.product.id}>
                  <td className={styles.table__pinned}>
                    <img
                      src={photo.product.thumbUrl}
                      alt=""
                      loading="lazy"
                      className={styles.table__thumb}
                    />
                  </td>
                  <td
                    className={`${photoStyles.photoCell} ${styles.table__titleCell}`}
                  >
                    <a
                      href={photo.product.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`${styles.table__primary} ${styles.table__link}`}
                    >
                      {photo.product.id}
                    </a>
                    {photo.product.mediaType === 'video' && (
                      <span className={photoStyles.videoBadge}>
                        {t('media.videoBadge')}
                      </span>
                    )}
                    <div className={styles.table__secondary}>
                      {photo.product.headline}
                    </div>
                  </td>
                  <td>{titleOf(photo)}</td>
                  <td className={styles.table__num}>{photo.salesCount}</td>
                  <td
                    className={`${styles.table__num} ${styles.table__revenue}`}
                    title={revenueHint(photo, t)}
                  >
                    {formatPartialRevenue(photo, formatMoney)}
                  </td>
                  <LicenseCells
                    licenses={licenses}
                    byLicense={photo.byLicense}
                    compact={compact}
                    sortKey={sortKey}
                  />
                  <td className={styles.table__num}>
                    {formatDate(photo.lastSale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
};
