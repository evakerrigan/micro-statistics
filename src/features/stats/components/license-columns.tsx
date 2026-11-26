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
};

export const LicenseHeaders = ({
  licenses,
  compact,
  ...sort
}: LicenseHeadersProps) => {
  const { t } = useI18n();
  if (!licenses.length) return null;
  if (compact) {
    return (
      <StackedSortHeader
        columns={licenses.map((l) => ({
          label: licenseLabel(l, t),
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
      label={<BreakableName name={licenseLabel(l, t)} />}
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
};

export const LicenseCells = ({
  licenses,
  byLicense,
  compact,
  sortKey,
}: LicenseCellsProps) => {
  const { t } = useI18n();
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
              label={licenseLabel(l, t)}
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
