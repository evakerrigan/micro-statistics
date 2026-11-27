import { useEffect, useState } from 'react';
import { StatsView } from '@/features/stats';
import { ClearData, SyncPanel } from '@/features/sync';
import { useI18n } from '@/hooks/use-i18n';
import { loadDataset } from '@/lib/storage';
import type { Dataset } from '@/types/stock';
import styles from './dashboard.module.scss';

export const IstockRoute = () => {
  const { t } = useI18n();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadDataset('istock').then((stored) => {
      setDataset(stored);
      setLoaded(true);
    });
  }, []);

  return (
    <div className={styles.dashboard}>
      <SyncPanel stock="istock" dataset={dataset} onSynced={setDataset} />
      {loaded && dataset && <StatsView stock="istock" dataset={dataset} />}
      {loaded && dataset && (
        <ClearData stock="istock" onCleared={() => setDataset(null)} />
      )}
      {loaded && !dataset && (
        <div className={styles.dashboard__empty}>
          <p>{t('istock.empty')}</p>
        </div>
      )}
    </div>
  );
};
