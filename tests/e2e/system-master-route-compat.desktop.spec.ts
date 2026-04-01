import { expect, test } from '@playwright/test';
import { selectSystemMasterStaffRows } from '../../lib/system-master-staff-query';

function makeMissingColumnError(columnName: string) {
  return {
    code: '42703',
    message: `column "${columnName}" does not exist`,
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
