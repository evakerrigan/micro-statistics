import { useCallback } from 'react';
import { loadHiddenChartYears, saveHiddenChartYears } from '@/lib/storage';
import type { HiddenChartYears, StockId } from '@/types/stock';
import { useStoredState } from './use-stored-state';

const EMPTY: HiddenChartYears = {};

/**
 * Years switched off in the “By upload year” charts, persisted in extension
 * storage per page so they stay off after leaving the page.
 */
export const useHiddenChartYears = (
  scope: StockId | 'all' = 'shutterstock'
) => {
  const load = useCallback(() => loadHiddenChartYears(scope), [scope]);
  const save = useCallback(
    (hidden: HiddenChartYears) => saveHiddenChartYears(hidden, scope),
    [scope]
  );
  const { value, ready, update } = useStoredState(load, save, EMPTY);
  const toggle = (chart: string, year: string) =>
    update((current) => {
      const years = current[chart] ?? [];
      const next = years.includes(year)
        ? years.filter((y) => y !== year)
        : [...years, year];
      return { ...current, [chart]: next };
    });
  return { value, ready, toggle };
};
