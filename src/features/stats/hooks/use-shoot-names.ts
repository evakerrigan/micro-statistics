import { useCallback } from 'react';
import { loadShootNames, saveShootNames } from '@/lib/storage';
import type { ShootNames } from '@/types/shutterstock';
import { useStoredState } from './use-stored-state';

const EMPTY: ShootNames = {};

/** Custom titles given to upload-date shoots, persisted in extension storage. */
export const useShootNames = () => {
  const state = useStoredState(loadShootNames, saveShootNames, EMPTY);
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
