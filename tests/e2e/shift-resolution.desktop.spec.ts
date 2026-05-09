import { expect, test } from '@playwright/test';
import { buildShiftLookup, isShiftScheduledOnDate, resolveAssignedShift } from '../../lib/shift-resolution';

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

test('resolveAssignedShift does not use a weekday-only default shift on Saturday', async () => {
  const lookup = buildShiftLookup([
    {
      id: 'default-regular',
      name: 'Regular',
      company_name: 'SY INC.',
      start_time: '08:30:00',
      end_time: '17:30:00',
      weekly_work_days: 5,
      is_weekend_work: false,
    },
  ]);

  const shift = resolveAssignedShift(
    null,
    lookup,
    {
      fallbackShiftId: 'default-regular',
      preferredCompany: 'SY INC.',
      workDate: '2026-05-09',
    },
  );

  expect(shift).toBeNull();
});

test('resolveAssignedShift keeps an explicit Saturday assignment even when the shift template is weekday-only', async () => {
  const lookup = buildShiftLookup([
    {
      id: 'assigned-regular',
      name: 'Regular',
      company_name: 'SY INC.',
      start_time: '08:30:00',
      end_time: '17:30:00',
      weekly_work_days: 5,
      is_weekend_work: false,
    },
  ]);

  const shift = resolveAssignedShift(
    { shift_id: 'assigned-regular' },
    lookup,
    {
      preferredCompany: 'SY INC.',
      workDate: '2026-05-09',
    },
  );

  expect(shift?.id).toBe('assigned-regular');
});

test('isShiftScheduledOnDate treats weekend-enabled shift templates as Saturday workdays', async () => {
  expect(
    isShiftScheduledOnDate(
      {
        id: 'weekend-regular',
        weekly_work_days: 7,
        is_weekend_work: true,
      },
      '2026-05-09',
    ),
  ).toBe(true);
});

test('resolveAssignedShift applies stored weekday-specific times from shift metadata', async () => {
  const lookup = buildShiftLookup([
    {
      id: 'regular-with-saturday',
      name: 'Regular',
      company_name: 'SY INC.',
      start_time: '09:00:00',
      end_time: '18:00:00',
      weekly_work_days: 6,
      is_weekend_work: true,
      description:
        '[SHIFT_META]{"work_day_mode":"all_days","daily_schedules":{"mon":{"enabled":true,"start_time":"09:00","end_time":"18:00"},"sat":{"enabled":true,"start_time":"10:00","end_time":"14:00"},"sun":{"enabled":false,"start_time":"09:00","end_time":"18:00"}}}',
    },
  ]);

  const saturdayShift = resolveAssignedShift(null, lookup, {
    fallbackShiftId: 'regular-with-saturday',
    preferredCompany: 'SY INC.',
    workDate: '2026-05-09',
  });
  const sundayShift = resolveAssignedShift(null, lookup, {
    fallbackShiftId: 'regular-with-saturday',
    preferredCompany: 'SY INC.',
    workDate: '2026-05-10',
  });

  expect(saturdayShift?.start_time).toBe('10:00');
  expect(saturdayShift?.end_time).toBe('14:00');
  expect(sundayShift).toBeNull();
});
