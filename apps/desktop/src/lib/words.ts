/** ISO 时间串取日期部分，如 2026-10-04T... -> 2026-10-04 */
export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}
