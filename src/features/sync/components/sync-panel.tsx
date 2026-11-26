import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/hooks/use-i18n';
import type { Translate } from '@/lib/i18n';
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
import styles from './sync-panel.module.scss';

type SyncPanelProps = {
  /** Data from the previous update, if any. */
  dataset: Dataset | null;
  onSynced: (dataset: Dataset) => void;
};

const progressLabel = (progress: SyncProgress, t: Translate) => {
  switch (progress.step) {
    case 'connect':
      return t('progress.connect');
    case 'portfolio':
      return t('progress.portfolio');
    case 'months':
      return t('progress.months');
    case 'sales':
      return t('progress.sales');
  }
};

const errorMessage = (error: unknown, t: Translate) => {
  if (error instanceof ShutterstockAuthError) return t('sync.errorAuth');
  if (error instanceof ShutterstockFormatError) {
    return `${t('sync.errorFormat')} (${error.message})`;
  }
  if (error instanceof ShutterstockHttpError) {
    return t('sync.errorHttp', { status: error.status });
  }
  return error instanceof Error ? error.message : String(error);
};

export const SyncPanel = ({ dataset, onSynced }: SyncPanelProps) => {
  const { t } = useI18n();
  const syncedAt = dataset?.syncedAt ?? null;
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<unknown>(null);
  const canSync = isExtensionContext();

  const handleSync = async () => {
    setError(null);
    try {
      const next = await collectDataset(setProgress, dataset);
      await saveDataset(next, 'shutterstock');
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

  return (
    <section className={styles.syncPanel}>
      <div className={styles.syncPanel__row}>
        <div className={styles.syncPanel__heading}>
          <h2 className={styles.syncPanel__title}>{t('stock.shutterstock')}</h2>
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
            <span>{progressLabel(progress, t)}</span>
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
          <p className={styles.syncPanel__note}>{t('sync.keepOpen')}</p>
        </div>
      )}

      {error !== null && (
        <p role="alert" className={styles.syncPanel__error}>
          {errorMessage(error, t)}
        </p>
      )}
    </section>
  );
};
