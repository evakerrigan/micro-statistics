import type { ImageFingerprint } from '@/types/stock';

/** Current hash algorithm version; bumping invalidates older cached hashes. */
export const HASH_VERSION = 2;

const HASH_GRID = 9;
const SAMPLE_BLOCK = 4;
const SAMPLE_SIZE = HASH_GRID * SAMPLE_BLOCK;
const HASH_CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 12000;
const RETRY_DELAY_MS = 350;
const BATCH_SAVE_EVERY = 24;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pixelsToFingerprint = (
  data: Uint8ClampedArray,
  width: number,
  height: number
): ImageFingerprint => {
  const luma = new Float32Array(HASH_GRID * HASH_GRID);
  const blockPixels = SAMPLE_BLOCK * SAMPLE_BLOCK;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;

  // Average each 4x4 block in the 36x36 sample to prevent single-pass Skia aliasing.
  for (let gy = 0; gy < HASH_GRID; gy++) {
    for (let gx = 0; gx < HASH_GRID; gx++) {
      let br = 0;
      let bg = 0;
      let bb = 0;
      for (let dy = 0; dy < SAMPLE_BLOCK; dy++) {
        const py = gy * SAMPLE_BLOCK + dy;
        for (let dx = 0; dx < SAMPLE_BLOCK; dx++) {
          const px = gx * SAMPLE_BLOCK + dx;
          const off = (py * SAMPLE_SIZE + px) * 4;
          br += data[off];
          bg += data[off + 1];
          bb += data[off + 2];
        }
      }
      const r = br / blockPixels;
      const g = bg / blockPixels;
      const b = bb / blockPixels;
      rSum += r;
      gSum += g;
      bSum += b;
      luma[gy * HASH_GRID + gx] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }

  // Build 64-bit horizontal & vertical gradient hashes as 16-char hex strings.
  let hHex = '';
  let vHex = '';
  let hNibble = 0;
  let vNibble = 0;
  let bitCount = 0;

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const idx = y * HASH_GRID + x;
      const hBit = luma[idx] > luma[idx + 1] ? 1 : 0;
      const vBit = luma[idx] > luma[idx + HASH_GRID] ? 1 : 0;
      hNibble = (hNibble << 1) | hBit;
      vNibble = (vNibble << 1) | vBit;
      bitCount += 1;
      if (bitCount === 4) {
        hHex += hNibble.toString(16);
        vHex += vNibble.toString(16);
        hNibble = 0;
        vNibble = 0;
        bitCount = 0;
      }
    }
  }

  const totalCells = HASH_GRID * HASH_GRID;
  return {
    ver: HASH_VERSION,
    h: hHex,
    v: vHex,
    rgb: [
      Math.round(rSum / totalCells),
      Math.round(gSum / totalCells),
      Math.round(bSum / totalCells),
    ],
    aspect: height > 0 ? Math.round((width / height) * 100) : 100,
  };
};

const sampleViaCanvas = (
  source: CanvasImageSource,
  width: number,
  height: number,
  sharedCanvas?: HTMLCanvasElement
): ImageFingerprint | null => {
  const canvas = sharedCanvas ?? document.createElement('canvas');
  if (canvas.width !== SAMPLE_SIZE) canvas.width = SAMPLE_SIZE;
  if (canvas.height !== SAMPLE_SIZE) canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  ctx.drawImage(source, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const imgData = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return pixelsToFingerprint(imgData.data, width, height);
};

const loadViaImage = (
  url: string,
  useCors = true,
  sharedCanvas?: HTMLCanvasElement
): Promise<ImageFingerprint | null> =>
  new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = (val: ImageFingerprint | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(val);
    };
    const timer = window.setTimeout(() => done(null), FETCH_TIMEOUT_MS);
    if (useCors) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        done(
          sampleViaCanvas(
            img,
            img.naturalWidth || img.width,
            img.naturalHeight || img.height,
            sharedCanvas
          )
        );
      } catch {
        done(null);
      }
    };
    img.onerror = () => done(null);
    img.src = url;
  });

const decodeBlobFingerprint = async (
  blob: Blob,
  sharedCanvas?: HTMLCanvasElement
): Promise<ImageFingerprint | null> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      try {
        return sampleViaCanvas(
          bitmap,
          bitmap.width,
          bitmap.height,
          sharedCanvas
        );
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall through to object URL Image decoding.
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await loadViaImage(objectUrl, false, sharedCanvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const loadViaFetch = async (
  url: string,
  sharedCanvas?: HTMLCanvasElement
): Promise<ImageFingerprint | null> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        credentials: 'omit',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt === 0) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        return null;
      }
      const blob = await res.blob();
      return await decodeBlobFingerprint(blob, sharedCanvas);
    } catch {
      if (attempt === 0) await sleep(RETRY_DELAY_MS);
    }
  }
  return null;
};

/**
 * Computes a compact perceptual fingerprint for a thumbnail URL.
 * Inside the Chrome extension, `fetch` bypasses CDN CORS restrictions via
 * `host_permissions`; outside it, falls back to anonymous `Image`.
 */
export const computeImageFingerprint = async (
  url: string,
  sharedCanvas?: HTMLCanvasElement
): Promise<ImageFingerprint | null> => {
  if (!url) return null;
  const isExt = typeof chrome !== 'undefined' && !!chrome.runtime?.id;
  if (isExt) {
    const result = await loadViaFetch(url, sharedCanvas);
    if (result) return result;
  }
  return loadViaImage(url, true, sharedCanvas);
};

const POPCOUNT_NIBBLE = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

const hexHamming = (a: string, b: string): number => {
  const len = Math.min(a.length, b.length);
  let dist = 0;
  for (let i = 0; i < len; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    dist += POPCOUNT_NIBBLE[x];
  }
  return dist;
};

/** 128-bit gradient Hamming distance (`0` = identical, `128` = opposite). */
export const fingerprintDistance = (
  a: ImageFingerprint,
  b: ImageFingerprint
): number => hexHamming(a.h, b.h) + hexHamming(a.v, b.v);

export const rgbDistance = (a: ImageFingerprint, b: ImageFingerprint): number =>
  (Math.abs(a.rgb[0] - b.rgb[0]) +
    Math.abs(a.rgb[1] - b.rgb[1]) +
    Math.abs(a.rgb[2] - b.rgb[2])) /
  3;

export type FingerprintProgress = {
  done: number;
  total: number;
  failed: number;
  snapshot?: Record<string, ImageFingerprint>;
};

/** Computes missing or outdated (`ver !== HASH_VERSION`) thumbnail fingerprints. */
export const computeMissingFingerprints = async (
  items: { uid: string; thumbUrl: string }[],
  existing: Record<string, ImageFingerprint>,
  onProgress?: (progress: FingerprintProgress) => void
): Promise<{ hashes: Record<string, ImageFingerprint>; failed: number }> => {
  const todo = items.filter(
    (item) => item.thumbUrl && existing[item.uid]?.ver !== HASH_VERSION
  );
  if (!todo.length) return { hashes: existing, failed: 0 };

  const next = { ...existing };
  let cursor = 0;
  let done = 0;
  let failed = 0;
  onProgress?.({ done: 0, total: todo.length, failed: 0 });

  const workers = Array.from(
    { length: Math.min(HASH_CONCURRENCY, todo.length) },
    async () => {
      const canvas = document.createElement('canvas');
      canvas.width = SAMPLE_SIZE;
      canvas.height = SAMPLE_SIZE;
      for (;;) {
        const index = cursor++;
        if (index >= todo.length) return;
        const item = todo[index];
        const fp = await computeImageFingerprint(item.thumbUrl, canvas);
        if (fp) {
          next[item.uid] = fp;
        } else {
          failed += 1;
        }
        done += 1;
        const isCheckpoint =
          done % BATCH_SAVE_EVERY === 0 || done === todo.length;
        onProgress?.({
          done,
          total: todo.length,
          failed,
          snapshot: isCheckpoint ? { ...next } : undefined,
        });
      }
    }
  );
  await Promise.all(workers);
  return { hashes: { ...next }, failed };
};
