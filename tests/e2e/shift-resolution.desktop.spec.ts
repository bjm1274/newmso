import { expect, test } from '@playwright/test';
import { buildShiftLookup, resolveAssignedShift } from '../../lib/shift-resolution';

test('resolveAssignedShift falls back when an assigned shift belongs to another company', async () => {
  const lookup = buildShiftLookup([
    {
      id: 'assigned-820',
      name: 'Regular',
      company_name: 'Other Clinic',
      start_time: '08:20:00',
      end_time: '17:00:00',
    },
    {
      id: 'default-830',
      name: 'Regular',
      company_name: 'SY INC.',
      start_time: '08:30:00',
      end_time: '17:30:00',
    },
  ]);

  const shift = resolveAssignedShift(
    { shift_id: 'assigned-820' },
    lookup,
    { fallbackShiftId: 'default-830', preferredCompany: 'SY INC.' },
  );

  expect(shift?.id).toBe('default-830');
  expect(shift?.start_time).toBe('08:30:00');
});

test('resolveAssignedShift keeps a same-company assignment ahead of the default shift', async () => {
  const lookup = buildShiftLookup([
    {
      id: 'assigned-820',
      name: 'Morning',
      company_name: 'SY INC.',
      start_time: '08:20:00',
      end_time: '17:00:00',
    },
    {
      id: 'default-830',
      name: 'Regular',
      company_name: 'SY INC.',
      start_time: '08:30:00',
      end_time: '17:30:00',
    },
  ]);

  const shift = resolveAssignedShift(
    { shift_id: 'assigned-820' },
    lookup,
    { fallbackShiftId: 'default-830', preferredCompany: 'SY INC.' },
  );

  expect(shift?.id).toBe('assigned-820');
  expect(shift?.start_time).toBe('08:20:00');
});
