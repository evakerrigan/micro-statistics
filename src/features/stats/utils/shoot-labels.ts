import type { MessageKey, Translate } from '@/lib/i18n';
import { formatDate } from '@/utils/format';
import { type PhotoStat, type ShootStat, UNKNOWN_LICENSE } from './aggregate';

const LICENSE_KEYS: Record<string, MessageKey> = {
  '25_a_day': 'license.25_a_day',
  on_demand: 'license.on_demand',
  enhanced: 'license.enhanced',
  single_image_and_other: 'license.single_image_and_other',
  cart_sales: 'license.cart_sales',
  clip_packs: 'license.clip_packs',
  footage_enhanced: 'license.footage_enhanced',
  earning_pools_commission: 'license.earning_pools_commission',
  referrals: 'license.referrals',
  unlimited: 'license.unlimited',
  contest_award: 'license.contest_award',
  adobe_subscription: 'license.adobe_subscription',
  adobe_standard: 'license.adobe_standard',
  adobe_custom: 'license.adobe_custom',
  adobe_firefly: 'license.adobe_firefly',
  adobe_other_payment: 'license.adobe_other_payment',
  adobe_historical: 'license.adobe_historical',
  [UNKNOWN_LICENSE]: 'license.other',
};

/** A shoot's name for display; «No shoot» is translated and date-shoots use formatted date unless renamed. */
export const shootTitle = (shoot: ShootStat, t: Translate) => {
  if (shoot.kind === 'unmatched') return t('shoot.unmatched');
  if (shoot.kind === 'auto') {
    return shoot.customTitle || formatDate(shoot.uploadedAt);
  }
  return shoot.title;
};

/** A license type's name for display. */
export const licenseLabel = (license: string, t: Translate) => {
  const key = LICENSE_KEYS[license];
  if (key) return t(key);
  return license.replace(/_/g, ' ');
};

/** The second line under a shoot's name: upload date, kind or joined parts. */
export const shootSubtitle = (shoot: ShootStat, t: Translate) => {
  const base = baseSubtitle(shoot, t);
  const joined = shoot.mergedFrom.length;
  return joined ? `${base} · ${t('shoots.sub.joined', { n: joined })}` : base;
};

const baseSubtitle = (shoot: ShootStat, t: Translate) => {
  if (shoot.kind === 'unmatched') return t('shoots.sub.unmatched');
  if (shoot.kind === 'manual') return t('shoots.sub.manual');
  if (shoot.customTitle) {
    return t('shoots.sub.upload', { date: formatDate(shoot.uploadedAt) });
  }
  return t('shoots.sub.uploadDate');
};

type RevenueStat = {
  revenue: number;
  salesCount: number;
  detailedSalesCount: number;
};

/** Whether every known download happened outside the detailed 3-year window. */
export const isHistoricalOnly = (
  stat: Pick<RevenueStat, 'salesCount' | 'detailedSalesCount'>
) => stat.salesCount > 0 && stat.detailedSalesCount === 0;

/** Formats per-file or per-shoot revenue (`—` when only >3y counts exist). */
export const formatPartialRevenue = (
  stat: RevenueStat,
  formatMoney: (value: number) => string
) => (isHistoricalOnly(stat) ? '—' : formatMoney(stat.revenue));

/** Tooltip explaining missing or partial (>3y) per-file revenue on Adobe Stock. */
export const revenueHint = (
  stat: Pick<RevenueStat, 'salesCount' | 'detailedSalesCount'>,
  t: Translate
) => {
  if (isHistoricalOnly(stat)) return t('stats.historicalRevenueHint');
  if (stat.salesCount > stat.detailedSalesCount) {
    return t('stats.partialRevenueHint', {
      known: stat.detailedSalesCount,
      total: stat.salesCount,
    });
  }
  return undefined;
};

/** Formats a photo's download count + optional last sale date. */
export const formatSoldMeta = (
  photo: Pick<PhotoStat, 'salesCount' | 'lastSale'>,
  t: Translate,
  fmtDate: (value: string | null) => string
) =>
  photo.lastSale
    ? t('details.soldMeta', {
        n: photo.salesCount,
        date: fmtDate(photo.lastSale),
      })
    : t('details.soldCountOnly', { n: photo.salesCount });
