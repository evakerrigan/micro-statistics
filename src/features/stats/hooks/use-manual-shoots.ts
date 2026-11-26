import { useCallback } from 'react';
import { loadManualShoots, saveManualShoots } from '@/lib/storage';
import type { ManualShoot, StockId } from '@/types/stock';
import { useStoredState } from './use-stored-state';

export type ManualShootsUpdate = (shoots: ManualShoot[]) => ManualShoot[];

const EMPTY: ManualShoot[] = [];

/** The user's hand-made shoots, persisted in extension storage per stock. */
export const useManualShoots = (stock: StockId = 'shutterstock') => {
  const load = useCallback(() => loadManualShoots(stock), [stock]);
  const save = useCallback(
    (shoots: ManualShoot[]) => saveManualShoots(shoots, stock),
    [stock]
  );
  const state = useStoredState(load, save, EMPTY);
  const { update: updateStored } = state;

  // A shoot with no items left is removed automatically.
  const update = useCallback(
    (fn: ManualShootsUpdate) =>
      updateStored((shoots) => fn(shoots).filter((s) => s.productIds.length)),
    [updateStored]
  );

  return { ...state, update };
};
