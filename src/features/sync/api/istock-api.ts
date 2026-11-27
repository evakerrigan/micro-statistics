import { IstockFormatError, type IstockSession } from '@/lib/istock-client';
import type { MediaKind } from '@/types/stock';

export type GettyPeriod = {
  /** e.g. `"2026-10-01"` */
  value: string;
  /** e.g. `"2026-10"` */
  monthKey: string;
  year: string;
  month: string;
};

export type GettyContract = {
  id: string;
  description: string;
  hasConnectSales: boolean;
  /** Form value expected by `/Reports/Export`, e.g. `"7877560:true"`. */
  formValue: string;
};

export type GettyTsvRow = {
  assetId: string;
  alternateAssetNumber: string;
  headline: string;
  mediaType: MediaKind;
  isIllustration: boolean;
  license: string;
  salesDate: string;
  royaltyMonth: string;
  grossRoyaltyUsd: number;
  statementGrossUsd: number;
};

export type EspDownloadSummary = {
  MasterId: string;
  ContentType: string;
  Collection: string;
  UsageType: string;
  GettyPaImagesCount: number;
  GettyAlcImagesCount: number;
  GettyUpImagesCount: number;
  IstockSubsCount: number;
  IstockCreditsCount: number;
  GettySubCount: number;
  OtherCount: number;
  TotalCount: number;
  ApprovalDate: string | null;
  LastDownloadDate: string | null;
  ThumbnailUrl: string | null;
};

export type EspBatch = {
  id: string;
  contributions_count: number;
  created_at: string;
  last_submitted_at: string | null;
  status: string;
};

export type EspContribution = {
  id: string;
  master_id: string | null;
  istock_master_id: string | null;
  headline: string | null;
  caption: string | null;
  file_name: string | null;
  status: string;
  thumbnail_url: string | null;
  created_at: string | null;
  submitted_at: string | null;
  published_at: string | null;
  esp_media_type: string | null;
};

const MONTH_ABBR: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/** Parses `27-Sep-2026` or `Oct-2026` into `YYYY-MM-DD` (or `null`). */
export const parseGettyDate = (raw: string): string | null => {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const dmy = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
  if (dmy) {
    const mm = MONTH_ABBR[dmy[2].toLowerCase()];
    if (mm) return `${dmy[3]}-${mm}-${dmy[1].padStart(2, '0')}`;
  }

  const my = /^([A-Za-z]{3})-(\d{4})$/.exec(s);
  if (my) {
    const mm = MONTH_ABBR[my[1].toLowerCase()];
    if (mm) return `${my[2]}-${mm}-01`;
  }

  return null;
};

export const normalizeIstockLicense = (productType: string): string => {
  const raw = productType.trim().toLowerCase();
  if (!raw) return 'istock_other';
  if (raw.includes('subscription') || raw.includes('sub')) {
    return 'istock_subscription';
  }
  if (raw.includes('premium access')) return 'istock_premium_access';
  if (raw.includes('credit')) return 'istock_credit';
  if (raw.includes('connect')) return 'istock_connect';
  if (
    raw.includes('partner') ||
    raw.includes('portal') ||
    raw.includes('api')
  ) {
    return 'istock_partner';
  }
  if (raw.includes('editorial')) return 'istock_editorial';
  if (raw.includes('rf') || raw.includes('royalty free')) return 'istock_rf';
  return 'istock_other';
};

export const mediaKindFromGettyType = (
  raw: string
): { mediaType: MediaKind; isIllustration: boolean } => {
  const lower = raw.trim().toLowerCase();
  if (
    lower.includes('video') ||
    lower.includes('footage') ||
    lower.includes('motion')
  ) {
    return { mediaType: 'video', isIllustration: false };
  }
  return {
    mediaType: 'photo',
    isIllustration: lower.includes('illustr') || lower.includes('vector'),
  };
};

export const stripAssetIdPrefix = (desc: string, assetId: string): string => {
  const trimmed = desc.trim();
  if (!trimmed) return '';
  if (assetId && trimmed.startsWith(`${assetId}-`)) {
    return trimmed.slice(assetId.length + 1).trim();
  }
  return trimmed;
};

type RawPeriodItem = {
  Text?: string;
  Value?: string;
};

type RawAvailablePeriodsResponse = {
  Options?: {
    AvailableStatementPeriods?: RawPeriodItem[];
  };
  AvailableStatementPeriods?: RawPeriodItem[];
};

export const fetchAvailablePeriods = async (
  session: IstockSession
): Promise<GettyPeriod[]> => {
  const res = await session.getAccountJson<RawAvailablePeriodsResponse>(
    '/Reports/AvailableStatementPeriod'
  );
  const rawList =
    res?.Options?.AvailableStatementPeriods ?? res?.AvailableStatementPeriods;
  if (!Array.isArray(rawList)) {
    throw new IstockFormatError('AvailableStatementPeriod missing list');
  }
  const seen = new Set<string>();
  const periods: GettyPeriod[] = [];
  for (const item of rawList) {
    const val = (item.Value ?? '').trim();
    const match = /^(\d{4})-(\d{2})-\d{2}/.exec(val);
    if (!match) continue;
    const monthKey = `${match[1]}-${match[2]}`;
    if (seen.has(monthKey)) continue;
    seen.add(monthKey);
    periods.push({
      value: val,
      monthKey,
      year: match[1],
      month: match[2],
    });
  }
  return periods.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
};

type RawContract = {
  ContractId?: string | number;
  ContractDescription?: string;
  HasConnectSales?: boolean;
};

type RawContractsResponse = {
  Contracts?: RawContract[];
};

export const fetchAvailableContracts = async (
  session: IstockSession,
  statementPeriod: string
): Promise<GettyContract[]> => {
  const res = await session.getAccountJson<RawContractsResponse>(
    `/Reports/AvailableContracts?statementPeriod=${encodeURIComponent(statementPeriod)}`
  );
  const raw = res?.Contracts;
  if (!Array.isArray(raw)) return [];
  const contracts: GettyContract[] = [];
  for (const c of raw) {
    const id = c.ContractId !== undefined ? String(c.ContractId).trim() : '';
    if (!id) continue;
    const hasConnectSales = Boolean(c.HasConnectSales);
    contracts.push({
      id,
      description: c.ContractDescription ?? id,
      hasConnectSales,
      formValue: `${id}:${hasConnectSales ? 'true' : 'false'}`,
    });
  }
  return contracts;
};

export const exportStatementTsv = async (
  session: IstockSession,
  year: string,
  month: string,
  contractFormValue: string,
  exportFormat: 'tsv' | 'ctsv'
): Promise<string> =>
  session.postAccountFormText('/Reports/Export', {
    exportIStockHistory: 'false',
    reportTypes: 'monthly',
    Years: year,
    Months: String(Number(month)),
    contractId: contractFormValue,
    exportFormat,
    IsStatementReportFromS3FeatureActive: 'False',
  });

export const parseGettyTsv = (text: string): GettyTsvRow[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // If HTML was returned (e.g. "no data" page), ignore or fail safely.
  if (trimmed.startsWith('<')) return [];

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map((h) => h.trim());
  if (
    !headers.includes('Gross Royalty in USD') &&
    !headers.includes('Asset Number')
  ) {
    return [];
  }

  const colIndex = new Map<string, number>();
  headers.forEach((h, idx) => colIndex.set(h, idx));
  const get = (cols: string[], name: string) =>
    (cols[colIndex.get(name) ?? -1] ?? '').trim();

  const rows: GettyTsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const assetId = get(cols, 'Asset Number');
    const alternateAssetNumber = get(cols, 'Alternate Asset Number');
    const rawDesc = get(cols, 'Asset Description');
    const headline =
      stripAssetIdPrefix(rawDesc, assetId) || alternateAssetNumber;
    const { mediaType, isIllustration } = mediaKindFromGettyType(
      get(cols, 'Content Type')
    );
    const royaltyMonth = parseGettyDate(get(cols, 'Royalty Month')) ?? '';
    const salesDate = parseGettyDate(get(cols, 'Sales Date')) ?? royaltyMonth;
    if (!salesDate) continue;

    const grossRoyaltyUsd = Number(get(cols, 'Gross Royalty in USD')) || 0;
    const statementGrossUsd =
      Number(get(cols, 'StatementSummary_Totals_Gross')) || 0;

    rows.push({
      assetId,
      alternateAssetNumber,
      headline,
      mediaType,
      isIllustration,
      license: normalizeIstockLicense(get(cols, 'Product Type')),
      salesDate,
      royaltyMonth,
      grossRoyaltyUsd,
      statementGrossUsd,
    });
  }
  return rows;
};

type RawCurrentUser = {
  integration_id?: string | number;
  vendor_id?: string | number;
};

export const fetchEspCurrentUser = async (
  session: IstockSession
): Promise<{ integrationId: string | null; vendorId: string | null }> => {
  const res = await session.getEspJson<RawCurrentUser>(
    '/api/account/v1/users/current'
  );
  return {
    integrationId:
      res?.integration_id !== undefined ? String(res.integration_id) : null,
    vendorId: res?.vendor_id !== undefined ? String(res.vendor_id) : null,
  };
};

export const fetchEspStatsMonths = async (
  session: IstockSession
): Promise<string[]> => {
  const res = await session.getEspJson<string[]>(
    '/api/account/v1/statistics/months'
  );
  if (!Array.isArray(res)) return [];
  return res.filter((m) => /^\d{4}-\d{2}$/.test(m));
};

type RawDownloadsResponse = {
  TotalAssetCount?: number;
  TotalDownloadCount?: number;
  AssetDownloadSummaries?: EspDownloadSummary[];
};

export const fetchEspDownloadsPage = async (
  session: IstockSession,
  fromDate: string,
  toDate: string,
  page: number,
  pageSize = 100
): Promise<{
  totalAssets: number;
  totalDownloads: number;
  items: EspDownloadSummary[];
}> => {
  const qs = new URLSearchParams({
    orderResultsBy: 'LastDownloadDate',
    sortDirection: 'Descending',
    page: String(page),
    pageSize: String(pageSize),
    assetTypes: 'Photo,Video,Illustration',
    fromDate,
    toDate,
  });
  const res = await session.getEspJson<RawDownloadsResponse>(
    `/api/account/v1/statistics/downloads_for_search?${qs.toString()}`
  );
  return {
    totalAssets: Number(res?.TotalAssetCount ?? 0),
    totalDownloads: Number(res?.TotalDownloadCount ?? 0),
    items: Array.isArray(res?.AssetDownloadSummaries)
      ? res.AssetDownloadSummaries
      : [],
  };
};

type RawAdpEntry = {
  getty_images_adp?: string;
  istock_adp?: string;
};

export type EspAdpUrls = {
  istockUrl: string;
  gettyUrl: string;
};

export const fetchEspAdpUrls = async (
  session: IstockSession,
  masterIds: string[]
): Promise<Map<string, EspAdpUrls>> => {
  const map = new Map<string, EspAdpUrls>();
  if (masterIds.length === 0) return map;
  const res = await session.getEspJson<Record<string, RawAdpEntry>>(
    `/api/submission/v1/asset_details/adp_urls?master_ids=${encodeURIComponent(masterIds.join(','))}`
  );
  if (!res || typeof res !== 'object') return map;
  for (const [id, entry] of Object.entries(res)) {
    const istockUrl = entry?.istock_adp ?? '';
    const gettyUrl = entry?.getty_images_adp ?? '';
    if (istockUrl || gettyUrl) {
      map.set(id, { istockUrl, gettyUrl });
    }
  }
  return map;
};

const FULL_MONTHS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

const parseEnglishDate = (raw: string): string | null => {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const mm = FULL_MONTHS[m[1].toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[2].padStart(2, '0')}`;
};

const decodeHtmlAttr = (raw: string) =>
  raw
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .trim();

export const fetchGettyAdpMetadata = async (
  gettyUrl: string,
  assetId: string
): Promise<{
  createdAt: string | null;
  thumbUrl: string;
  headline: string;
} | null> => {
  try {
    const res = await fetch(gettyUrl, { credentials: 'omit' });
    if (!res.ok) return null;
    const html = await res.text();

    let thumbUrl = '';
    const ogMatch =
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(
        html
      ) ??
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(
        html
      ) ??
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i.exec(
        html
      );
    if (ogMatch?.[1]) {
      thumbUrl = decodeHtmlAttr(ogMatch[1]);
    } else if (assetId) {
      const mediaMatch = new RegExp(
        `https://media\\.gettyimages\\.com/id/${assetId}/[^"'\\s<>]+`,
        'i'
      ).exec(html);
      if (mediaMatch?.[0]) thumbUrl = decodeHtmlAttr(mediaMatch[0]);
    }

    let createdAt: string | null = null;
    const jsonDateMatch =
      /"(?:uploadDate|datePublished|dateCreated)"\s*:\s*"(\d{4}-\d{2}-\d{2})/i.exec(
        html
      );
    if (jsonDateMatch?.[1]) {
      createdAt = jsonDateMatch[1];
    } else {
      const textDateMatch =
        /Upload date[^A-Za-z0-9]{0,160}([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/i.exec(
          html
        );
      if (textDateMatch?.[1]) {
        createdAt = parseEnglishDate(textDateMatch[1]);
      }
    }

    let headline = '';
    const h1Match = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
    if (h1Match?.[1]) {
      headline = decodeHtmlAttr(h1Match[1])
        .replace(/\s*-\s*stock\s+(?:photo|illustration|video)\s*$/i, '')
        .trim();
    }

    if (!thumbUrl && !createdAt && !headline) return null;
    return { createdAt, thumbUrl, headline };
  } catch {
    return null;
  }
};

type RawBatchesResponse = {
  items?: EspBatch[];
  meta?: { total_items?: number };
};

export const fetchEspBatchesPage = async (
  session: IstockSession,
  integrationId: string,
  dateFrom: string,
  dateTo: string,
  page: number,
  pageSize = 50
): Promise<{ items: EspBatch[]; totalItems: number }> => {
  const qs = new URLSearchParams({
    page_size: String(pageSize),
    page: String(page),
    date_from: dateFrom,
    date_to: dateTo,
    sort_column: 'created_at',
    sort_order: 'DESC',
    user_filters: integrationId,
    boolean_filters: ',',
  });
  const res = await session.getEspJson<RawBatchesResponse>(
    `/api/submission/v1/submission_batches?${qs.toString()}`
  );
  return {
    items: Array.isArray(res?.items) ? res.items : [],
    totalItems: Number(res?.meta?.total_items ?? 0),
  };
};

export const fetchEspBatchContributions = async (
  session: IstockSession,
  batchId: string
): Promise<EspContribution[]> => {
  const res = await session.getEspJson<EspContribution[]>(
    `/api/submission/v1/submission_batches/${encodeURIComponent(batchId)}/contributions?with_asset_view_data=true&with_brief_notes=false`
  );
  return Array.isArray(res) ? res : [];
};
