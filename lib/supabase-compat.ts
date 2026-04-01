type SupabaseResult<T> = {
  data: T | null;
  error: any;
};

export function isMissingColumnError(error: any, columnName = 'company_id'): boolean {
  if (!error) return false;
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const column = columnName.toLowerCase();
  const escapedColumn = column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const columnPatterns = [
    new RegExp(`column\\s+(?:\\w+\\.)?${escapedColumn}\\b`, 'i'),
    new RegExp(`['"]${escapedColumn}['"]`, 'i'),
    new RegExp(`\\.${escapedColumn}\\b`, 'i'),
    new RegExp(`(^|[^a-z0-9_])${escapedColumn}([^a-z0-9_]|$)`, 'i'),
  ];

  return [message, details, hint].some((value) => columnPatterns.some((pattern) => pattern.test(value)));
}

export async function withMissingColumnFallback<T>(
  primary: () => PromiseLike<SupabaseResult<T>>,
  fallback: () => PromiseLike<SupabaseResult<T>>,
  columnName = 'company_id'
): Promise<SupabaseResult<T>> {
  const result = await primary();
  if (isMissingColumnError(result.error, columnName)) {
    return fallback();
  }
  return result;
}

export async function withMissingColumnsFallback<T>(
  execute: (omittedColumns: ReadonlySet<string>) => PromiseLike<SupabaseResult<T>>,
  columnNames: string[],
): Promise<SupabaseResult<T>> {
  const omittedColumns = new Set<string>();
  let result = await execute(omittedColumns);

  while (result.error) {
    const missingColumn = columnNames.find(
      (columnName) =>
        !omittedColumns.has(columnName) && isMissingColumnError(result.error, columnName),
    );

    if (!missingColumn) {
      return result;
    }

    omittedColumns.add(missingColumn);
    result = await execute(omittedColumns);
  }

  return result;
}
