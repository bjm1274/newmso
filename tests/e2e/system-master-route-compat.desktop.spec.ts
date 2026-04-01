import { expect, test } from '@playwright/test';
import { selectSystemMasterStaffRows } from '../../lib/system-master-staff-query';

function makeMissingColumnError(columnName: string) {
  return {
    code: '42703',
    message: `column "${columnName}" does not exist`,
  };
}

function makeQualifiedMissingColumnError(tableName: string, columnName: string) {
  return {
    code: '42703',
    message: `column ${tableName}.${columnName} does not exist`,
  };
}

function makeSchemaCacheMissingColumnError(columnName: string) {
  return {
    code: 'PGRST204',
    message: `Could not find the '${columnName}' column of 'staff_members' in the schema cache`,
  };
}

test('system master staff query retries without missing optional columns', async () => {
  const calls: Array<{ select: string; orderColumn: string }> = [];
  const missingColumns = new Set(['employee_no', 'resident_no']);
  const rows = [{ id: 'staff-1', name: 'System Master' }];

  const result = await selectSystemMasterStaffRows<{ id: string; name: string }>(
    async ({ select, orderColumn }) => {
      calls.push({ select, orderColumn });

      const selectedColumns = new Set(
        select
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );

      const missingColumn = Array.from(missingColumns).find(
        (columnName) => selectedColumns.has(columnName) || orderColumn === columnName,
      );

      if (missingColumn) {
        return {
          data: null,
          error: makeMissingColumnError(missingColumn),
        };
      }

      return {
        data: rows,
        error: null,
      };
    },
  );

  expect(result.error).toBeNull();
  expect(result.data).toEqual(rows);
  expect(calls).toHaveLength(3);
  expect(calls[0]).toMatchObject({ orderColumn: 'employee_no' });
  expect(calls[1]).toMatchObject({ orderColumn: 'name' });
  expect(calls[2]).toMatchObject({ orderColumn: 'name' });
  expect(calls[2]?.select).not.toContain('employee_no');
  expect(calls[2]?.select).not.toContain('resident_no');
});

test('system master staff query retries for qualified missing-column errors', async () => {
  const calls: Array<{ select: string; orderColumn: string }> = [];

  const result = await selectSystemMasterStaffRows<{ id: string; name: string }>(
    async ({ select, orderColumn }) => {
      calls.push({ select, orderColumn });

      if (select.includes('bank_name')) {
        return {
          data: null,
          error: makeQualifiedMissingColumnError('staff_members', 'bank_name'),
        };
      }

      return {
        data: [{ id: 'staff-qualified-1', name: 'Qualified Fallback' }],
        error: null,
      };
    },
  );

  expect(result.error).toBeNull();
  expect(result.data).toEqual([{ id: 'staff-qualified-1', name: 'Qualified Fallback' }]);
  expect(calls).toHaveLength(2);
  expect(calls[0]?.select).toContain('bank_name');
  expect(calls[1]?.select).not.toContain('bank_name');
});

test('system master staff query also retries for schema-cache missing column errors', async () => {
  const calls: Array<{ select: string; orderColumn: string }> = [];
  const result = await selectSystemMasterStaffRows<{ id: string; name: string }>(
    async ({ select, orderColumn }) => {
      calls.push({ select, orderColumn });

      if (select.includes('employee_no') || orderColumn === 'employee_no') {
        return {
          data: null,
          error: makeSchemaCacheMissingColumnError('employee_no'),
        };
      }

      if (select.includes('resident_no')) {
        return {
          data: null,
          error: makeSchemaCacheMissingColumnError('resident_no'),
        };
      }

      return {
        data: [{ id: 'staff-2', name: 'Fallback Staff' }],
        error: null,
      };
    },
  );

  expect(result.error).toBeNull();
  expect(result.data).toEqual([{ id: 'staff-2', name: 'Fallback Staff' }]);
  expect(calls).toHaveLength(3);
  expect(calls[2]?.select).not.toContain('employee_no');
  expect(calls[2]?.select).not.toContain('resident_no');
});
