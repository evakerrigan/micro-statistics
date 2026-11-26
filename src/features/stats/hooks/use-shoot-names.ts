import { useCallback } from 'react';
import { loadShootNames, saveShootNames } from '@/lib/storage';
import type { ShootNames, StockId } from '@/types/stock';
import { useStoredState } from './use-stored-state';

const EMPTY: ShootNames = {};

/** Custom titles given to upload-date shoots, persisted in extension storage per stock. */
export const useShootNames = (stock: StockId = 'shutterstock') => {
  const load = useCallback(() => loadShootNames(stock), [stock]);
  const save = useCallback(
    (names: ShootNames) => saveShootNames(names, stock),
    [stock]
  );
  const state = useStoredState(load, save, EMPTY);
  const { update } = state;

  const rename = useCallback(
    (key: string, title: string) =>
      update((current) => {
        const trimmed = title.trim();
        const next = { ...current };
        if (!trimmed) delete next[key];
        else next[key] = trimmed;
        return next;
      }),
    [update]
  );

  return { value: state.value, ready: state.ready, rename };
};
