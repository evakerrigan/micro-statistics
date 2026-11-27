import type { Dataset, ImageFingerprint, Shoot, StockId } from '@/types/stock';
import { compareAssetIds } from './aggregate';
import { fingerprintDistance, rgbDistance } from './image-hash';
import { normalizeTitle } from './match-assets';

const DAY_MS = 24 * 60 * 60 * 1000;
const SHOOT_WINDOW_MS = 46 * DAY_MS; // ±1.5 months between compared photos
const MAX_SHOOT_SPAN_MS = 62 * DAY_MS; // ≤2 months from first to last photo in a shoot
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const GENERIC_WORDS = new Set([
  'a',
  'an',
  'the',
  'on',
  'in',
  'at',
  'of',
  'to',
  'and',
  'or',
  'with',
  'for',
  'by',
  'from',
  'is',
  'are',
  'background',
  'isolated',
  'white',
  'black',
  'studio',
  'copy',
  'space',
  'copyspace',
  'concept',
  'photo',
  'image',
  'picture',
  'shot',
  'view',
  'closeup',
  'close',
  'portrait',
  'cute',
  'little',
  'happy',
  'funny',
  'adorable',
  'sweet',
  'young',
]);

const shootTokens = (text: string): Set<string> => {
  const words = normalizeTitle(text)
    .split(' ')
    .filter((w) => w.length > 1 && !GENERIC_WORDS.has(w));
  return new Set(words);
};

const tokenOverlap = (
  ta: Set<string>,
  tb: Set<string>
): { sim: number; shared: number } => {
  if (!ta.size || !tb.size) return { sim: 0, shared: 0 };
  let shared = 0;
  for (const word of ta) {
    if (tb.has(word)) shared += 1;
  }
  return { sim: (2 * shared) / (ta.size + tb.size), shared };
};

type DatedAsset = {
  id: string;
  uid: string;
  createdAt: string;
  dateMs: number;
  tokens: Set<string>;
};

/**
 * Groups a stock's dated assets into shoots by visual perceptual similarity
 * and title overlap (pairs within ±1.5 months, total shoot span ≤2 months)
 * and numbers them chronologically.
 */
export const buildSimilarityShoots = (
  dataset: Dataset,
  hashes: Record<string, ImageFingerprint>,
  stock: StockId
): Shoot[] => {
  const byId = new Map<
    string,
    { createdAt: string | null; headline: string }
  >();
  for (const item of dataset.portfolio) {
    byId.set(item.id, {
      createdAt: item.createdAt,
      headline: item.headline,
    });
  }
  for (const product of dataset.products) {
    const prev = byId.get(product.id);
    byId.set(product.id, {
      createdAt: prev?.createdAt ?? product.createdAt ?? null,
      headline: prev?.headline || product.headline,
    });
  }

  const items: DatedAsset[] = [];
  for (const [id, meta] of byId) {
    if (!meta.createdAt || !ISO_DATE_RE.test(meta.createdAt)) continue;
    const dateMs = Date.parse(`${meta.createdAt}T00:00:00Z`);
    if (Number.isNaN(dateMs)) continue;
    items.push({
      id,
      uid: `${stock}:${id}`,
      createdAt: meta.createdAt,
      dateMs,
      tokens: shootTokens(meta.headline),
    });
  }

  items.sort((a, b) => a.dateMs - b.dateMs || compareAssetIds(a.id, b.id));

  type Candidate = { a: string; b: string; score: number };
  const candidates: Candidate[] = [];

  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const fpA = hashes[a.uid];

    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (b.dateMs - a.dateMs > SHOOT_WINDOW_MS) break;
      const fpB = hashes[b.uid];

      const { sim, shared } = tokenOverlap(a.tokens, b.tokens);

      if (fpA && fpB) {
        const aspectDiff = Math.abs(fpA.aspect - fpB.aspect);
        const dist = fingerprintDistance(fpA, fpB);
        const colorDiff = rgbDistance(fpA, fpB);

        if (dist <= 20 && colorDiff <= 16 && aspectDiff <= 18) {
          candidates.push({ a: a.id, b: b.id, score: dist });
          continue;
        }
        if (
          dist <= 32 &&
          colorDiff <= 26 &&
          aspectDiff <= 25 &&
          sim >= 0.38 &&
          shared >= 2
        ) {
          candidates.push({
            a: a.id,
            b: b.id,
            score: 20 + dist - sim * 15,
          });
          continue;
        }
        if (colorDiff <= 26 && sim >= 0.5 && shared >= 2) {
          candidates.push({
            a: a.id,
            b: b.id,
            score: 40 + colorDiff - sim * 20,
          });
          continue;
        }
        if (sim >= 0.6 && shared >= 3) {
          candidates.push({ a: a.id, b: b.id, score: 60 - sim * 25 });
        }
      } else if (sim >= 0.6 && shared >= 3) {
        candidates.push({ a: a.id, b: b.id, score: 60 - sim * 25 });
      }
    }
  }

  candidates.sort((x, y) => x.score - y.score);

  const parent = new Map<string, string>(items.map((i) => [i.id, i.id]));
  const minDate = new Map<string, number>(items.map((i) => [i.id, i.dateMs]));
  const maxDate = new Map<string, number>(items.map((i) => [i.id, i.dateMs]));

  const find = (x: string): string => {
    let cur = x;
    while (parent.get(cur) !== cur) {
      cur = parent.get(cur)!;
    }
    let p = x;
    while (p !== cur) {
      const next = parent.get(p)!;
      parent.set(p, cur);
      p = next;
    }
    return cur;
  };

  for (const { a, b } of candidates) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) continue;
    const nextMin = Math.min(minDate.get(ra)!, minDate.get(rb)!);
    const nextMax = Math.max(maxDate.get(ra)!, maxDate.get(rb)!);
    if (nextMax - nextMin > MAX_SHOOT_SPAN_MS) continue;
    parent.set(rb, ra);
    minDate.set(ra, nextMin);
    maxDate.set(ra, nextMax);
  }

  const groups = new Map<string, DatedAsset[]>();
  for (const item of items) {
    const root = find(item.id);
    const list = groups.get(root);
    if (list) list.push(item);
    else groups.set(root, [item]);
  }

  const shoots: Shoot[] = [];
  for (const members of groups.values()) {
    const first = members[0];
    shoots.push({
      id: `sim:${first.id}`,
      title: first.createdAt,
      uploadedAt: first.createdAt,
      photoIds: members.map((m) => m.id),
    });
  }

  shoots.sort(
    (a, b) =>
      a.uploadedAt.localeCompare(b.uploadedAt) ||
      compareAssetIds(a.photoIds[0] ?? '', b.photoIds[0] ?? '')
  );

  return shoots.map((shoot, idx) => ({
    ...shoot,
    sequenceNumber: idx + 1,
  }));
};
