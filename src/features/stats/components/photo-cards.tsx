import { useI18n } from '@/hooks/use-i18n';
import { formatDate, formatMoney } from '@/utils/format';
import type { PhotoStat } from '../utils/aggregate';
import { licenseSortKey } from '../utils/license-columns';
import { licenseLabel } from '../utils/shoot-labels';
import { CardStat, RevenueBox } from './card-stat';
import type { SortState } from './sort-header';
import { SortBar } from './sort-bar';
import cardStyles from './cards.module.scss';
import photoStyles from './photos-table.module.scss';
import styles from './table.module.scss';

type PhotoCardsProps = SortState & {
  /** Already sorted and filtered. */
  photos: PhotoStat[];
  licenses: string[];
  shootTitleOf: (photo: PhotoStat) => string;
  emptyText: string;
};

/** The photos table as cards, for narrow screens. */
export const PhotoCards = ({
  photos,
  licenses,
  shootTitleOf,
  emptyText,
  sortKey,
  direction,
  onSort,
}: PhotoCardsProps) => {
  const { t } = useI18n();
  const sorted = (key: string) => key === sortKey;

  const options = [
    { label: t('col.revenue'), columnKey: 'revenue' },
    { label: t('col.sales'), columnKey: 'sales' },
    { label: t('photos.col.lastSale'), columnKey: 'lastSale' },
    { label: t('photos.col.photo'), columnKey: 'id' },
    { label: t('col.shoot'), columnKey: 'shoot' },
    ...licenses.map((l) => ({
      label: licenseLabel(l, t),
      columnKey: licenseSortKey(l),
    })),
  ];

  return (
    <>
      <SortBar
        options={options}
        sortKey={sortKey}
        direction={direction}
        onSort={onSort}
      />
      {photos.length === 0 && (
        <p className={styles.table__empty}>{emptyText}</p>
      )}
      <div className={cardStyles.cards}>
        {photos.map((photo) => (
          <article
            key={photo.uid ?? photo.product.id}
            className={cardStyles.card}
          >
            <div className={cardStyles.card__head}>
              <img
                src={photo.product.thumbUrl}
                alt=""
                loading="lazy"
                className={styles.table__thumb}
              />
              <div className={cardStyles.card__text}>
                <div>
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
                </div>
                <div className={styles.table__secondary}>
                  {photo.product.headline}
                </div>
              </div>
              <RevenueBox
                label={t('col.revenue')}
                value={formatMoney(photo.revenue)}
                highlighted={sorted('revenue')}
              />
            </div>
            <div className={cardStyles.card__stats}>
              <CardStat
                label={t('col.sales')}
                value={photo.salesCount}
                highlighted={sorted('sales')}
              />
              <CardStat
                label={t('photos.col.lastSale')}
                value={formatDate(photo.lastSale)}
                highlighted={sorted('lastSale')}
              />
              <CardStat
                label={t('col.shoot')}
                value={shootTitleOf(photo)}
                highlighted={sorted('shoot')}
              />
            </div>
            {licenses.length > 0 && (
              <div
                className={`${cardStyles.card__stats} ${cardStyles.card__partners}`}
              >
                {licenses.map((l) => (
                  <CardStat
                    key={l}
                    label={licenseLabel(l, t)}
                    value={
                      photo.byLicense[l] ? formatMoney(photo.byLicense[l]) : '—'
                    }
                    highlighted={sorted(licenseSortKey(l))}
                  />
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
};
