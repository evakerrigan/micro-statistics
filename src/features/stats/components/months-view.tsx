import { useMemo, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import type { MessageKey } from '@/lib/i18n';
import {
  formatMoney,
  formatMoneyShort,
  formatMoneyTick,
  formatMonth,
} from '@/utils/format';
import type { MonthStat } from '../utils/aggregate';
import { isDenseLicenseTable } from '../utils/license-columns';
import { licenseLabel } from '../utils/shoot-labels';
import { BreakableName } from './breakable-name';
import { MonthsChart } from './months-chart';
import { TableWrap } from './table-wrap';
import styles from './table.module.scss';
import chartStyles from './months-view.module.scss';

type MonthsViewProps = {
  months: MonthStat[];
  licenses: string[];
  /** Upload dates of the portfolio files, oldest first. */
  portfolioDates: string[];
  /** Optional custom formatter for breakdown column keys (defaults to license label). */
  formatColumn?: (key: string) => string;
};

const RANGES: { label: MessageKey; count: number }[] = [
  { label: 'months.range12', count: 12 },
  { label: 'months.range24', count: 24 },
  { label: 'months.all', count: Infinity },
];

const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Every month from the first sale up to now, with empty months as zero. */
const fillMonths = (months: MonthStat[]): MonthStat[] => {
  if (!months.length) return [];
  const byKey = new Map(months.map((m) => [m.key, m]));
  const [y, m] = months[0].key.split('-').map(Number);
  const cursor = new Date(y, m - 1, 1);
  const end = monthKey(new Date());
  const result: MonthStat[] = [];
  for (let key = monthKey(cursor); key <= end; key = monthKey(cursor)) {
    result.push(
      byKey.get(key) ?? { key, revenue: 0, salesCount: 0, byLicense: {} }
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
};

const roundMoney = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Months summed per calendar year, oldest first. Same shape as a month, with
 * `YYYY` as the key, so the year chart can reuse the month one.
 */
const sumByYear = (months: MonthStat[]): MonthStat[] => {
  const byYear = new Map<string, MonthStat>();
  for (const m of months) {
    const key = m.key.slice(0, 4);
    const stat = byYear.get(key) ?? {
      key,
      revenue: 0,
      salesCount: 0,
      byLicense: {},
    };
    stat.revenue += m.revenue;
    stat.salesCount += m.salesCount;
    for (const [l, amount] of Object.entries(m.byLicense)) {
      stat.byLicense[l] = (stat.byLicense[l] ?? 0) + amount;
    }
    byYear.set(key, stat);
  }
  return [...byYear.values()].map((y) => ({
    ...y,
    revenue: roundMoney(y.revenue),
    byLicense: Object.fromEntries(
      Object.entries(y.byLicense).map(([l, amount]) => [l, roundMoney(amount)])
    ),
  }));
};

/** Files already uploaded by the end of each month. */
const portfolioAtMonthEnd = (months: MonthStat[], dates: string[]) =>
  months.map((m) => dates.filter((d) => d.slice(0, 7) <= m.key).length);

/** Files already uploaded by the end of each year. */
const portfolioAtYearEnd = (years: MonthStat[], dates: string[]) =>
  years.map((y) => dates.filter((d) => d.slice(0, 4) <= y.key).length);

export const MonthsView = ({
  months,
  licenses,
  portfolioDates,
  formatColumn,
}: MonthsViewProps) => {
  const { t } = useI18n();
  const columnLabel = formatColumn ?? ((l: string) => licenseLabel(l, t));
  const [range, setRange] = useState<number>(24);

  const allMonths = useMemo(() => fillMonths(months), [months]);
  const years = useMemo(() => sumByYear(allMonths), [allMonths]);
  const currentYear = String(new Date().getFullYear());
  const visible = useMemo(
    () => (Number.isFinite(range) ? allMonths.slice(-range) : allMonths),
    [allMonths, range]
  );
  const portfolio = useMemo(
    () =>
      portfolioDates.length
        ? portfolioAtMonthEnd(visible, portfolioDates)
        : null,
    [visible, portfolioDates]
  );
  const yearPortfolio = useMemo(
    () =>
      portfolioDates.length ? portfolioAtYearEnd(years, portfolioDates) : null,
    [years, portfolioDates]
  );

  /** Revenue tooltip lines: number of downloads and the split by license. */
  const revenueTooltip = (m: MonthStat) => (
    <>
      <div className={chartStyles.tooltipMuted}>
        {t('months.tooltipSales', { n: m.salesCount })}
      </div>
      {licenses
        .filter((l) => m.byLicense[l])
        .map((l) => (
          <div key={l} className={chartStyles.tooltipMuted}>
            {columnLabel(l)}: {formatMoney(m.byLicense[l])}
          </div>
        ))}
    </>
  );

  return (
    <>
      {years.length > 0 && (
        <>
          <h2 className={`${chartStyles.title} ${chartStyles.titleSpaced}`}>
            {t('months.yearsTitle')}
          </h2>
          <div className={chartStyles.years}>
            <div className={`${styles.tableWrap} ${chartStyles.years__table}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('months.col.year')}</th>
                    <th className={styles.table__num}>{t('col.sales')}</th>
                    <th
                      className={`${styles.table__num} ${styles.table__revenue}`}
                    >
                      {t('col.revenue')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...years].reverse().map((y) => (
                    <tr key={y.key}>
                      <td>
                        {y.key}
                        {y.key === currentYear && (
                          <span className={chartStyles.yearPartial}>
                            {t('months.yearPartial')}
                          </span>
                        )}
                      </td>
                      <td className={styles.table__num}>{y.salesCount}</td>
                      <td
                        className={`${styles.table__num} ${styles.table__revenue}`}
                      >
                        {formatMoney(y.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MonthsChart
              className={chartStyles.years__chart}
              months={years}
              value={(y) => y.revenue}
              formatValue={formatMoney}
              formatTick={formatMoneyTick}
              formatKey={(key) =>
                key === currentYear
                  ? `${key} (${t('months.yearPartial')})`
                  : key
              }
              formatAxisKey={String}
              seriesLabel={t('months.legendRevenue')}
              portfolio={yearPortfolio}
              tooltipExtra={revenueTooltip}
              barLabel={(y) =>
                y.revenue < 10
                  ? formatMoney(y.revenue)
                  : formatMoneyShort(y.revenue)
              }
            />
          </div>
        </>
      )}

      <div className={chartStyles.toolbar}>
        <h2 className={chartStyles.title}>{t('months.title')}</h2>
        <div
          className={chartStyles.ranges}
          role="group"
          aria-label={t('months.period')}
        >
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              className={`${chartStyles.range} ${range === r.count ? chartStyles.rangeActive : ''}`}
              aria-pressed={range === r.count}
              onClick={() => setRange(r.count)}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
      </div>

      <MonthsChart
        months={visible}
        value={(m) => m.revenue}
        formatValue={formatMoney}
        formatTick={formatMoneyTick}
        seriesLabel={t('months.legendRevenue')}
        portfolio={portfolio}
        tooltipExtra={revenueTooltip}
      />

      <h2 className={`${chartStyles.title} ${chartStyles.titleSpaced}`}>
        {t('months.salesTitle')}
      </h2>
      <MonthsChart
        months={visible}
        value={(m) => m.salesCount}
        formatValue={(n) => t('months.tooltipSales', { n })}
        formatTick={String}
        integer
        tone="sales"
        seriesLabel={t('months.legendSales')}
        portfolio={portfolio}
        tooltipExtra={(m) => (
          <div className={chartStyles.tooltipMuted}>
            {formatMoney(m.revenue)}
          </div>
        )}
      />

      <TableWrap>
        <table
          className={`${styles.table} ${isDenseLicenseTable(licenses, false) ? styles.table__dense : ''}`}
        >
          <thead>
            <tr>
              <th className={styles.table__pinned}>{t('months.col.month')}</th>
              <th className={styles.table__num}>{t('col.sales')}</th>
              <th className={`${styles.table__num} ${styles.table__revenue}`}>
                {t('col.revenue')}
              </th>
              {licenses.map((l) => (
                <th
                  key={l}
                  className={`${styles.table__num} ${styles.table__partnerHead}`}
                >
                  <BreakableName name={columnLabel(l)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...visible]
              .reverse()
              .filter((m) => m.salesCount || m.revenue)
              .map((m) => (
                <tr key={m.key}>
                  <td className={styles.table__pinned}>{formatMonth(m.key)}</td>
                  <td className={styles.table__num}>{m.salesCount}</td>
                  <td
                    className={`${styles.table__num} ${styles.table__revenue}`}
                  >
                    {formatMoney(m.revenue)}
                  </td>
                  {licenses.map((l) => (
                    <td key={l} className={styles.table__num}>
                      {m.byLicense[l] ? formatMoney(m.byLicense[l]) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
};
