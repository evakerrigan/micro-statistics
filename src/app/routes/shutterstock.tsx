import { useEffect, useState } from 'react';
import { StatsView } from '@/features/stats';
import { ClearData, SyncPanel } from '@/features/sync';
import { useI18n } from '@/hooks/use-i18n';
import { loadDataset } from '@/lib/storage';
import type { Dataset } from '@/types/stock';
import styles from './dashboard.module.scss';

export const ShutterstockRoute = () => {
  const { t } = useI18n();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadDataset('shutterstock').then((stored) => {
      setDataset(stored);
      setLoaded(true);
    });
  }, []);

  return (
    <div className={styles.dashboard}>
      <SyncPanel dataset={dataset} onSynced={setDataset} />
      {loaded && dataset && (
        <StatsView stock="shutterstock" dataset={dataset} />
      )}
      {loaded && dataset && (
        <ClearData stock="shutterstock" onCleared={() => setDataset(null)} />
      )}
      {loaded && !dataset && (
        <div className={styles.dashboard__empty}>
          <p>{t('dashboard.empty')}</p>
        </div>
      )}
    </div>
  );
};
