import { useEffect, useState } from 'react';
import { StatsView } from '@/features/stats';
import { ClearData, SyncPanel } from '@/features/sync';
import { useI18n } from '@/hooks/use-i18n';
import { loadDataset } from '@/lib/storage';
import type { Dataset } from '@/types/stock';
import styles from './dashboard.module.scss';

export const AdobeRoute = () => {
  const { t } = useI18n();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadDataset('adobe').then((stored) => {
      setDataset(stored);
      setLoaded(true);
    });
  }, []);

  return (
    <div className={styles.dashboard}>
      <SyncPanel stock="adobe" dataset={dataset} onSynced={setDataset} />
      {loaded && dataset && <StatsView stock="adobe" dataset={dataset} />}
      {loaded && dataset && (
        <ClearData stock="adobe" onCleared={() => setDataset(null)} />
      )}
      {loaded && !dataset && (
        <div className={styles.dashboard__empty}>
          <p>{t('adobe.empty')}</p>
        </div>
      )}
    </div>
  );
};
