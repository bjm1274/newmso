type SupabaseResult<T> = {
  data: T | null;
  error: any;
};

export function isMissingColumnError(error: any, columnName = 'company_id'): boolean {
  if (!error) return false;
  const message = String(error?.message || error?.details || '').toLowerCase();
  const hint = String(error?.hint || '').toLowerCase();
  const code = String(error?.code || '');
  const column = columnName.toLowerCase();

  return (
    code === '42703' ||
    message.includes(`column ${column}`) ||
    message.includes(`'${column}'`) ||
    message.includes(`"${column}"`) ||
    hint.includes(column)
  );
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
