type SupabaseResult<T> = {
  data: T | null;
  error: any;
};

const missingRelations = new Set<string>();
const missingColumnFallbackCache = new Map<string, Set<string>>();

function normalizeRelationName(relationName: string): string {
  return relationName.trim().toLowerCase();
}

function hasMissingRelationSignal(message: string): boolean {
  return (
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('could not find the table') ||
    message.includes('schema cache')
  );
}

export function isMissingRelationError(error: any, relationName?: string): boolean {
  if (!error) return false;

  const code = String(error?.code || '').trim();
  const haystack = [error?.message, error?.details, error?.hint]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  if (relationName) {
    const target = normalizeRelationName(relationName);
    return (
      code === '42P01' ||
      code === 'PGRST205' ||
      (hasMissingRelationSignal(haystack) &&
        (haystack.includes(target) || haystack.includes(`public.${target}`)))
    );
  }

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    hasMissingRelationSignal(haystack)
  );
}

export function rememberMissingRelation(error: any, relationName: string): boolean {
  if (!isMissingRelationError(error, relationName)) return false;
  missingRelations.add(normalizeRelationName(relationName));
  return true;
}

export function isRelationMarkedMissing(relationName: string): boolean {
  return missingRelations.has(normalizeRelationName(relationName));
}

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
  options?: { cacheKey?: string },
): Promise<SupabaseResult<T>> {
  const omittedColumns = new Set<string>(
    options?.cacheKey ? missingColumnFallbackCache.get(options.cacheKey) ?? [] : []
  );
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
    if (options?.cacheKey) {
      missingColumnFallbackCache.set(options.cacheKey, new Set(omittedColumns));
    }
    result = await execute(omittedColumns);
  }

  return result;
}
