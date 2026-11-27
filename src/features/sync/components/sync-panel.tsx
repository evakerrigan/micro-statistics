import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/use-i18n';
import {
  AdobeAuthError,
  AdobeFormatError,
  AdobeHttpError,
} from '@/lib/adobe-client';
import type { Translate } from '@/lib/i18n';
import {
  IstockAuthError,
  IstockFormatError,
  IstockHttpError,
} from '@/lib/istock-client';
import {
  isExtensionContext,
  ShutterstockAuthError,
  ShutterstockFormatError,
  ShutterstockHttpError,
} from '@/lib/shutterstock-client';
import { saveDataset } from '@/lib/storage';
import type { Dataset } from '@/types/stock';
import { formatDate, formatTime } from '@/utils/format';
import { collectDataset, type SyncProgress } from '../collect';
import { collectAdobeDataset } from '../collect-adobe';
import { collectIstockDataset } from '../collect-istock';
import styles from './sync-panel.module.scss';

export type SyncableStock = 'shutterstock' | 'adobe' | 'istock';

type SyncPanelProps = {
  stock?: SyncableStock;
  /** Data from the previous update, if any. */
  dataset: Dataset | null;
  onSynced: (dataset: Dataset) => void;
};

const progressLabel = (
  progress: SyncProgress,
  stock: SyncableStock,
  t: Translate
) => {
  switch (progress.step) {
    case 'connect':
      if (stock === 'adobe') return t('progress.adobeConnect');
      if (stock === 'istock') return t('progress.istockConnect');
      return t('progress.connect');
    case 'portfolio':
      return t('progress.portfolio');
    case 'months':
      return t('progress.months');
    case 'sales':
      return t(stock === 'adobe' ? 'progress.adobeSales' : 'progress.sales');
  }
};

const errorMessage = (error: unknown, stock: SyncableStock, t: Translate) => {
  if (error instanceof ShutterstockAuthError) return t('sync.errorAuth');
  if (error instanceof AdobeAuthError) return t('sync.adobeErrorAuth');
  if (error instanceof IstockAuthError) {
    return t(
      error.source === 'accountmanagement'
        ? 'sync.istockErrorAuthAccount'
        : 'sync.istockErrorAuthEsp'
    );
  }
  if (error instanceof ShutterstockFormatError) {
    return `${t('sync.errorFormat')} (${error.message})`;
  }
  if (error instanceof AdobeFormatError) {
    return `${t('sync.adobeErrorFormat')} (${error.message})`;
  }
  if (error instanceof IstockFormatError) {
    return `${t('sync.istockErrorFormat')} (${error.message})`;
  }
  if (error instanceof ShutterstockHttpError) {
    return t('sync.errorHttp', { status: error.status });
  }
  if (error instanceof AdobeHttpError) {
    return t('sync.adobeErrorHttp', { status: error.status });
  }
  if (error instanceof IstockHttpError) {
    return t('sync.istockErrorHttp', { status: error.status });
  }
  void stock;
  return error instanceof Error ? error.message : String(error);
};

export const SyncPanel = ({
  stock = 'shutterstock',
  dataset,
  onSynced,
}: SyncPanelProps) => {
  const { t } = useI18n();
  const syncedAt = dataset?.syncedAt ?? null;
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<unknown>(null);
  const canSync = isExtensionContext();

  const handleSync = async () => {
    setError(null);
    try {
      const next =
        stock === 'adobe'
          ? await collectAdobeDataset(setProgress)
          : stock === 'istock'
            ? await collectIstockDataset(setProgress)
            : await collectDataset(setProgress, dataset);
      await saveDataset(next, stock);
      onSynced(next);
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
    }
  };

  const percent = progress
    ? Math.min(
        100,
        Math.round((progress.done / Math.max(1, progress.total)) * 100)
      )
    : 0;

  const titleKey =
    stock === 'adobe'
      ? 'stock.adobe'
      : stock === 'istock'
        ? 'stock.istock'
        : 'stock.shutterstock';

  const keepOpenKey =
    stock === 'adobe'
      ? 'sync.adobeKeepOpen'
      : stock === 'istock'
        ? 'sync.istockKeepOpen'
        : 'sync.keepOpen';

  return (
    <section className={styles.syncPanel}>
      <div className={styles.syncPanel__row}>
        <div className={styles.syncPanel__heading}>
          <h2 className={styles.syncPanel__title}>{t(titleKey)}</h2>
          {!syncedAt && (
            <p className={styles.syncPanel__meta}>{t('sync.noData')}</p>
          )}
        </div>
        <div className={styles.syncPanel__controls}>
          <div className={styles.syncPanel__actions}>
            <Button onClick={handleSync} disabled={!!progress || !canSync}>
              {progress
                ? t('sync.loading')
                : dataset
                  ? t('sync.quick')
                  : t('sync.first')}
            </Button>
            {syncedAt && (
              <div
                className={styles.syncPanel__updated}
                title={t('sync.updatedAt', {
                  date: formatDate(syncedAt),
                  time: formatTime(syncedAt),
                })}
              >
                <span>{t('sync.updatedLabel')}</span>
                <span>{formatDate(syncedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {!canSync && (
        <p className={styles.syncPanel__note}>{t('sync.extensionOnly')}</p>
      )}

      {progress && (
        <div className={styles.syncPanel__progress}>
          <div className={styles.syncPanel__progressLabel}>
            <span>{progressLabel(progress, stock, t)}</span>
            {progress.total > 1 && (
              <span>
                {progress.done} / {progress.total}
              </span>
            )}
          </div>
          <div className={styles.syncPanel__bar}>
            <div
              className={styles.syncPanel__barFill}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className={styles.syncPanel__note}>{t(keepOpenKey)}</p>
        </div>
      )}

      {error !== null && (
        <p role="alert" className={styles.syncPanel__error}>
          {errorMessage(error, stock, t)}
        </p>
      )}
    </section>
  );
};
