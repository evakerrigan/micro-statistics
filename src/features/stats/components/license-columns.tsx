import { useI18n } from '@/hooks/use-i18n';
import { formatMoney } from '@/utils/format';
import type { LicenseTotals } from '../utils/aggregate';
import { licenseSortKey } from '../utils/license-columns';
import { licenseLabel } from '../utils/shoot-labels';
import { BreakableName } from './breakable-name';
import { SortHeader, type SortState, StackedSortHeader } from './sort-header';
import { StackRow } from './stack-row';
import styles from './table.module.scss';

type LicenseHeadersProps = SortState & {
  licenses: string[];
  /** One stacked column instead of a column per license type. */
  compact: boolean;
  /** Optional label override (used for stock columns on the All tab). */
  formatLabel?: (key: string) => string;
};

export const LicenseHeaders = ({
  licenses,
  compact,
  formatLabel,
  ...sort
}: LicenseHeadersProps) => {
  const { t } = useI18n();
  const labelOf = formatLabel ?? ((l: string) => licenseLabel(l, t));
  if (!licenses.length) return null;
  if (compact) {
    return (
      <StackedSortHeader
        columns={licenses.map((l) => ({
          label: labelOf(l),
          columnKey: licenseSortKey(l),
        }))}
        numeric
        {...sort}
      />
    );
  }
  return licenses.map((l) => (
    <SortHeader
      key={l}
      label={<BreakableName name={labelOf(l)} />}
      columnKey={licenseSortKey(l)}
      numeric
      className={styles.table__partnerHead}
      {...sort}
    />
  ));
};

type LicenseCellsProps = {
  licenses: string[];
  byLicense: LicenseTotals;
  compact: boolean;
  /** The table's sort key: the license type sorted by is highlighted. */
  sortKey: string;
  formatLabel?: (key: string) => string;
};

export const LicenseCells = ({
  licenses,
  byLicense,
  compact,
  sortKey,
  formatLabel,
}: LicenseCellsProps) => {
  const { t } = useI18n();
  const labelOf = formatLabel ?? ((l: string) => licenseLabel(l, t));
  const isSorted = (l: string) => licenseSortKey(l) === sortKey;
  const amount = (l: string) =>
    byLicense[l] ? formatMoney(byLicense[l]) : '—';
  if (!licenses.length) return null;
  if (compact) {
    return (
      <td className={`${styles.table__num} ${styles.table__compact}`}>
        <div className={styles.table__pairs}>
          {licenses.map((l) => (
            <StackRow
              key={l}
              label={labelOf(l)}
              value={amount(l)}
              highlighted={isSorted(l)}
            />
          ))}
        </div>
      </td>
    );
  }
  return licenses.map((l) => (
    <td
      key={l}
      className={`${styles.table__num} ${isSorted(l) ? styles.table__sorted : ''}`}
    >
      {amount(l)}
    </td>
  ));
};
