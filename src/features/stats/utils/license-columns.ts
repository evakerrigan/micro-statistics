/** Sort key of a license type's column. */
export const licenseSortKey = (license: string) => `license:${license}`;

/** Number of table columns the license columns take up. */
export const licenseColumnCount = (licenses: string[], compact: boolean) =>
  compact ? Math.min(1, licenses.length) : licenses.length;

/** License columns that still fit a 1600px screen with the usual padding. */
const ROOMY_LICENSE_LIMIT = 10;

/**
 * Whether the table needs tighter cells: past the limit the license columns
 * alone push it wider than the screen.
 */
export const isDenseLicenseTable = (licenses: string[], compact: boolean) =>
  licenseColumnCount(licenses, compact) > ROOMY_LICENSE_LIMIT;
