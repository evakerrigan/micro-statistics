import { useCallback, useEffect, useState } from 'react';
import { loadImageHashes, saveImageHashes } from '@/lib/storage';
import type { ImageFingerprint } from '@/types/stock';
import { computeMissingFingerprints, HASH_VERSION } from '../utils/image-hash';

export type HashStatus = {
  running: boolean;
  done: number;
  total: number;
  failed: number;
};

/**
 * Loads cached thumbnail perceptual hashes, computes missing or outdated ones
 * with incremental checkpoints, and exposes live loading/finished status.
 */
export const useImageHashes = (
  items: { uid: string; thumbUrl: string }[],
  enabled: boolean
) => {
  const [hashes, setHashes] = useState<Record<string, ImageFingerprint>>({});
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<HashStatus>({
    running: false,
    done: 0,
    total: 0,
    failed: 0,
  });

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    loadImageHashes().then(async (stored) => {
      if (cancelled) return;
      setHashes(stored);
      setReady(true);

      const missing =
        enabled && items.length > 0
          ? items.filter(
              (i) => i.thumbUrl && stored[i.uid]?.ver !== HASH_VERSION
            )
          : [];

      if (!missing.length) {
        setStatus({ running: false, done: 0, total: 0, failed: 0 });
        return;
      }

      setStatus({ running: true, done: 0, total: missing.length, failed: 0 });
      const result = await computeMissingFingerprints(
        missing,
        stored,
        (batch) => {
          if (cancelled) return;
          setStatus({
            running: true,
            done: batch.done,
            total: batch.total,
            failed: batch.failed,
          });
          if (batch.snapshot) {
            setHashes(batch.snapshot);
            void saveImageHashes(batch.snapshot);
          }
        }
      );
      if (cancelled) return;
      setHashes(result.hashes);
      await saveImageHashes(result.hashes);
      if (cancelled) return;
      setStatus({
        running: false,
        done: missing.length,
        total: missing.length,
        failed: result.failed,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [items, enabled, attempt]);

  const effectiveStatus: HashStatus =
    !ready && enabled && items.length > 0
      ? { running: true, done: 0, total: items.length, failed: 0 }
      : status;

  return { hashes, ready, status: effectiveStatus, retry };
};
