import type {
  AssetMatchOverrides,
  ImageFingerprint,
  StockId,
} from '@/types/stock';
import type { LicenseTotals, PhotoStat } from './aggregate';
import { fingerprintDistance, rgbDistance } from './image-hash';

export type StockPhotoPart = {
  uid: string;
  stock: StockId;
  photo: PhotoStat;
  shootLabel: string;
};

export type MergedPhotoStat = {
  uid: string;
  primary: StockPhotoPart;
  parts: StockPhotoPart[];
  salesCount: number;
  revenue: number;
  lastSale: string | null;
  byStock: LicenseTotals;
  isManualLink: boolean;
};

const round = (n: number) => Math.round(n * 10000) / 10000;

export const pairKey = (a: string, b: string) =>
  a < b ? `${a}|${b}` : `${b}|${a}`;

export const normalizeTitle = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP_WORDS = new Set([
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
]);

const titleTokens = (text: string): Set<string> => {
  const words = normalizeTitle(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  return new Set(words);
};

const tokenSetSimilarity = (ta: Set<string>, tb: Set<string>): number => {
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const word of ta) {
    if (tb.has(word)) shared += 1;
  }
  return (2 * shared) / (ta.size + tb.size);
};

/** Dice similarity over normalized non-trivial words (`0..1`). */
export const tokenSimilarity = (a: string, b: string): number =>
  tokenSetSimilarity(titleTokens(a), titleTokens(b));

const latest = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : a > b ? a : b;

/**
 * Matches identical photos/videos across different microstocks using visual
 * perceptual thumbnail hashes + title similarity, respecting manual link/unlink
 * overrides.
 */
export const matchAcrossStocks = (
  items: StockPhotoPart[],
  hashes: Record<string, ImageFingerprint>,
  overrides: AssetMatchOverrides
): MergedPhotoStat[] => {
  const byUid = new Map(items.map((item) => [item.uid, item]));
  const parent = new Map<string, string>(items.map((i) => [i.uid, i.uid]));
  const members = new Map<string, StockPhotoPart[]>(
    items.map((i) => [i.uid, [i]])
  );
  const blocked = new Set(overrides.unlinks);
  const manualGroups = new Set<string>();

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

  const union = (a: string, b: string, isManual: boolean) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) {
      if (isManual) manualGroups.add(ra);
      return;
    }
    const ma = members.get(ra)!;
    const mb = members.get(rb)!;
    if (ma.length >= mb.length) {
      parent.set(rb, ra);
      members.set(ra, [...ma, ...mb]);
      members.delete(rb);
      if (isManual || manualGroups.has(rb)) manualGroups.add(ra);
      manualGroups.delete(rb);
    } else {
      parent.set(ra, rb);
      members.set(rb, [...mb, ...ma]);
      members.delete(ra);
      if (isManual || manualGroups.has(ra)) manualGroups.add(rb);
      manualGroups.delete(ra);
    }
  };

  // 1. Apply manual links first.
  for (const [a, b] of overrides.links) {
    if (byUid.has(a) && byUid.has(b)) {
      union(a, b, true);
    }
  }

  // Precompute normalized headlines, token sets, and per-stock title counts.
  const normTitles = new Map<string, string>();
  const tokenSets = new Map<string, Set<string>>();
  const titleCounts = new Map<string, number>();
  for (const item of items) {
    const headline = item.photo.product.headline;
    const norm = normalizeTitle(headline);
    normTitles.set(item.uid, norm);
    tokenSets.set(item.uid, titleTokens(headline));
    if (!norm) continue;
    const key = `${item.stock}:${norm}`;
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  // Cache whether an unhashed item shares >= 0.72 title overlap with any sibling
  // on the same stock, preventing false fallback merges across same-shoot shots.
  const nearDupCache = new Map<string, boolean>();
  const hasSameStockNearDup = (item: StockPhotoPart): boolean => {
    const cached = nearDupCache.get(item.uid);
    if (cached !== undefined) return cached;
    const tok = tokenSets.get(item.uid)!;
    let found = false;
    if (tok.size > 0) {
      for (const other of items) {
        if (other.uid === item.uid || other.stock !== item.stock) continue;
        if (other.photo.product.mediaType !== item.photo.product.mediaType) {
          continue;
        }
        if (tokenSetSimilarity(tok, tokenSets.get(other.uid)!) >= 0.72) {
          found = true;
          break;
        }
      }
    }
    nearDupCache.set(item.uid, found);
    return found;
  };

  // 2. Score all valid cross-stock pairs.
  type Candidate = { a: string; b: string; score: number };
  const candidates: Candidate[] = [];

  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const fpA = hashes[a.uid];
    const normA = normTitles.get(a.uid)!;
    const tokA = tokenSets.get(a.uid)!;

    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (a.stock === b.stock) continue;
      if (a.photo.product.mediaType !== b.photo.product.mediaType) continue;
      if (blocked.has(pairKey(a.uid, b.uid))) continue;

      const fpB = hashes[b.uid];
      const tokB = tokenSets.get(b.uid)!;
      const titleSim = tokenSetSimilarity(tokA, tokB);

      if (fpA && fpB) {
        const aspectDiff = Math.abs(fpA.aspect - fpB.aspect);
        if (aspectDiff > 22) continue;
        const dist = fingerprintDistance(fpA, fpB);
        const colorDiff = rgbDistance(fpA, fpB);
        const strongVisual = dist <= 16 && colorDiff <= 25 && aspectDiff <= 15;
        const visualWithTitle =
          dist <= 28 && colorDiff <= 34 && titleSim >= 0.5;
        if (!strongVisual && !visualWithTitle) continue;
        candidates.push({
          a: a.uid,
          b: b.uid,
          score: dist - titleSim * 12,
        });
      } else {
        const normB = normTitles.get(b.uid)!;
        const uniqueExact =
          normA.length >= 12 &&
          normA === normB &&
          titleCounts.get(`${a.stock}:${normA}`) === 1 &&
          titleCounts.get(`${b.stock}:${normB}`) === 1;
        const uniqueDetailed =
          tokA.size >= 7 &&
          tokB.size >= 7 &&
          titleSim >= 0.88 &&
          titleCounts.get(`${a.stock}:${normA}`) === 1 &&
          titleCounts.get(`${b.stock}:${normB}`) === 1 &&
          !hasSameStockNearDup(a) &&
          !hasSameStockNearDup(b);
        if (uniqueExact || uniqueDetailed) {
          candidates.push({
            a: a.uid,
            b: b.uid,
            score: uniqueExact ? 20 : 25 - titleSim * 5,
          });
        }
      }
    }
  }

  candidates.sort((x, y) => x.score - y.score);

  // 3. Greedy 1-to-1 merge across disjoint stocks.
  for (const { a, b } of candidates) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) continue;
    const ma = members.get(ra)!;
    const mb = members.get(rb)!;
    const stocksA = new Set(ma.map((m) => m.stock));
    if (mb.some((m) => stocksA.has(m.stock))) continue;
    const hasBlocked = ma.some((x) =>
      mb.some((y) => blocked.has(pairKey(x.uid, y.uid)))
    );
    if (hasBlocked) continue;
    union(ra, rb, false);
  }

  // 4. Assemble merged photo stats sorted by combined revenue.
  const groups: MergedPhotoStat[] = [];
  for (const [root, groupMembers] of members.entries()) {
    const parts = [...groupMembers].sort(
      (x, y) => y.photo.revenue - x.photo.revenue
    );
    const byStock: LicenseTotals = {};
    let revenue = 0;
    let salesCount = 0;
    let lastSale: string | null = null;
    for (const part of parts) {
      revenue = round(revenue + part.photo.revenue);
      salesCount += part.photo.salesCount;
      lastSale = latest(lastSale, part.photo.lastSale);
      byStock[part.stock] = round(
        (byStock[part.stock] ?? 0) + part.photo.revenue
      );
    }
    groups.push({
      uid: parts
        .map((p) => p.uid)
        .sort()
        .join('+'),
      primary: parts[0],
      parts,
      salesCount,
      revenue,
      lastSale,
      byStock,
      isManualLink: manualGroups.has(root),
    });
  }

  return groups.sort((a, b) => b.revenue - a.revenue);
};

/** Ranks candidate other-stock rows to link manually with `target`. */
export const suggestLinkCandidates = (
  target: MergedPhotoStat,
  allRows: MergedPhotoStat[],
  hashes: Record<string, ImageFingerprint>
): MergedPhotoStat[] => {
  const targetMedia = target.primary.photo.product.mediaType;
  const targetStocks = new Set(target.parts.map((p) => p.stock));
  const targetFp = hashes[target.primary.uid];
  const targetHeadline = target.primary.photo.product.headline;

  return allRows
    .filter(
      (row) =>
        row.uid !== target.uid &&
        row.primary.photo.product.mediaType === targetMedia &&
        row.parts.every((p) => !targetStocks.has(p.stock))
    )
    .map((row) => {
      const fp = hashes[row.primary.uid];
      const titleSim = tokenSimilarity(
        targetHeadline,
        row.primary.photo.product.headline
      );
      const dist = targetFp && fp ? fingerprintDistance(targetFp, fp) : 64;
      const score = dist - titleSim * 40;
      return { row, score };
    })
    .sort((a, b) => a.score - b.score)
    .map((x) => x.row);
};
