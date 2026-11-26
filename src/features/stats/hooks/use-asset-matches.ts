import { useCallback } from 'react';
import {
  loadAssetMatchOverrides,
  saveAssetMatchOverrides,
} from '@/lib/storage';
import type { AssetMatchOverrides } from '@/types/stock';
import { pairKey } from '../utils/match-assets';
import { useStoredState } from './use-stored-state';

const EMPTY: AssetMatchOverrides = { links: [], unlinks: [] };

/** Manual cross-stock link / unlink choices persisted in extension storage. */
export const useAssetMatches = () => {
  const state = useStoredState(
    loadAssetMatchOverrides,
    saveAssetMatchOverrides,
    EMPTY
  );
  const { update } = state;

  const linkAssets = useCallback(
    (uidA: string, uidB: string) =>
      update((cur) => {
        const key = pairKey(uidA, uidB);
        const already = cur.links.some(([a, b]) => pairKey(a, b) === key);
        return {
          links: already ? cur.links : [...cur.links, [uidA, uidB]],
          unlinks: cur.unlinks.filter((k) => k !== key),
        };
      }),
    [update]
  );

  const unlinkGroup = useCallback(
    (uids: string[]) =>
      update((cur) => {
        const uidSet = new Set(uids);
        const newUnlinks = new Set(cur.unlinks);
        for (let i = 0; i < uids.length; i++) {
          for (let j = i + 1; j < uids.length; j++) {
            newUnlinks.add(pairKey(uids[i], uids[j]));
          }
        }
        return {
          links: cur.links.filter(
            ([a, b]) => !(uidSet.has(a) && uidSet.has(b))
          ),
          unlinks: [...newUnlinks],
        };
      }),
    [update]
  );

  return {
    value: state.value,
    ready: state.ready,
    linkAssets,
    unlinkGroup,
  };
};
