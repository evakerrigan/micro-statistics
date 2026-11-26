import { useEffect, useState } from 'react';
import { AllStatsView } from '@/features/stats';
import { ClearData } from '@/features/sync';
import {
  loadAllDatasets,
  loadManualShoots,
  loadShootMerges,
  loadShootNames,
} from '@/lib/storage';
import {
  type Dataset,
  type ManualShoot,
  type ShootMerges,
  type ShootNames,
  STOCK_IDS,
  type StockId,
} from '@/types/stock';
import styles from './dashboard.module.scss';

type AllState = {
  datasets: Partial<Record<StockId, Dataset>>;
  manualByStock: Partial<Record<StockId, ManualShoot[]>>;
  mergesByStock: Partial<Record<StockId, ShootMerges>>;
  namesByStock: Partial<Record<StockId, ShootNames>>;
};

export const AllRoute = () => {
  const [state, setState] = useState<AllState | null>(null);

  useEffect(() => {
    const loadAll = async () => {
      const datasets = await loadAllDatasets();
      const manualEntries = await Promise.all(
        STOCK_IDS.map(async (id) => [id, await loadManualShoots(id)] as const)
      );
      const mergeEntries = await Promise.all(
        STOCK_IDS.map(async (id) => [id, await loadShootMerges(id)] as const)
      );
      const nameEntries = await Promise.all(
        STOCK_IDS.map(async (id) => [id, await loadShootNames(id)] as const)
      );
      setState({
        datasets,
        manualByStock: Object.fromEntries(manualEntries),
        mergesByStock: Object.fromEntries(mergeEntries),
        namesByStock: Object.fromEntries(nameEntries),
      });
    };
    loadAll();
  }, []);

  const hasAny = state ? Object.keys(state.datasets).length > 0 : false;

  return (
    <div className={styles.dashboard}>
      {state && (
        <AllStatsView
          datasets={state.datasets}
          manualByStock={state.manualByStock}
          mergesByStock={state.mergesByStock}
          namesByStock={state.namesByStock}
        />
      )}
      {hasAny && <ClearData />}
    </div>
  );
};
