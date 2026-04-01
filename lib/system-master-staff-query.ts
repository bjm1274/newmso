type QueryErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined;

type QueryResult<T> = {
  data: T[] | null;
  error: QueryErrorLike;
};

type QueryExecutor<T> = (options: {
  select: string;
  orderColumn: string;
}) => PromiseLike<QueryResult<T>>;

const SYSTEM_MASTER_STAFF_REQUIRED_COLUMNS = ['id', 'name'] as const;

export const SYSTEM_MASTER_STAFF_OPTIONAL_COLUMNS = [
  'employee_no',
  'company',
  'department',
  'position',
  'role',
  'status',
  'email',
  'phone',
  'resident_no',
  'bank_name',
  'bank_account',
  'base_salary',
] as const;

export function isSystemMasterStaffMissingColumnError(
  error: QueryErrorLike,
  columnName: string,
): boolean {
  if (!error) return false;
  const code = String(error.code || '').trim();
  const message = String(error.message || error.details || '').toLowerCase();
  const hint = String(error.hint || '').toLowerCase();
  const needle = columnName.toLowerCase();
  const missingColumnMessage =
    message.includes(`column ${needle}`) ||
    message.includes(`"${needle}"`) ||
    message.includes(`'${needle}'`) ||
    message.includes(`could not find the '${needle}' column`) ||
    message.includes(`could not find the "${needle}" column`) ||
    hint.includes(needle);

  return (
    ((code === '42703' || code === 'PGRST204' || code === 'PGRST200' || !code) &&
      missingColumnMessage)
  );
}

export function buildSystemMasterStaffSelect(omittedColumns: ReadonlySet<string>) {
  return [
    ...SYSTEM_MASTER_STAFF_REQUIRED_COLUMNS,
    ...SYSTEM_MASTER_STAFF_OPTIONAL_COLUMNS.filter((columnName) => !omittedColumns.has(columnName)),
  ].join(', ');
}

export function getSystemMasterStaffOrderColumn(omittedColumns: ReadonlySet<string>) {
  if (!omittedColumns.has('employee_no')) return 'employee_no';
  if (!omittedColumns.has('name')) return 'name';
  return 'id';
}

export async function selectSystemMasterStaffRows<T>(
  execute: QueryExecutor<T>,
): Promise<QueryResult<T>> {
  const omittedColumns = new Set<string>();

  while (true) {
    const result = await execute({
      select: buildSystemMasterStaffSelect(omittedColumns),
      orderColumn: getSystemMasterStaffOrderColumn(omittedColumns),
    });

    if (!result.error) {
      return result;
    }

    const missingColumn = SYSTEM_MASTER_STAFF_OPTIONAL_COLUMNS.find(
      (columnName) =>
        !omittedColumns.has(columnName) &&
        isSystemMasterStaffMissingColumnError(result.error, columnName),
    );

    if (!missingColumn) {
      return result;
    }

    omittedColumns.add(missingColumn);
  }
}
