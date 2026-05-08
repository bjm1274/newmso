-- Staff permission UI once reused real staff metadata keys as boolean toggles.
-- Preserve real metadata values, move only legacy boolean toggles to namespaced keys.
UPDATE public.staff_members AS staff
SET permissions = COALESCE(
  (
    SELECT jsonb_object_agg(entry.key, entry.value)
    FROM jsonb_each(
      COALESCE(staff.permissions, '{}'::jsonb) ||
      jsonb_strip_nulls(
        jsonb_build_object(
          'staff_meta_license_no',
            CASE WHEN jsonb_typeof(staff.permissions -> 'license_no') = 'boolean' THEN staff.permissions -> 'license_no' END,
          'staff_meta_license_date',
            CASE WHEN jsonb_typeof(staff.permissions -> 'license_date') = 'boolean' THEN staff.permissions -> 'license_date' END,
          'staff_meta_employment_type',
            CASE WHEN jsonb_typeof(staff.permissions -> 'employment_type') = 'boolean' THEN staff.permissions -> 'employment_type' END,
          'staff_meta_contract_end_date',
            CASE WHEN jsonb_typeof(staff.permissions -> 'contract_end_date') = 'boolean' THEN staff.permissions -> 'contract_end_date' END,
          'staff_meta_probation_months',
            CASE WHEN jsonb_typeof(staff.permissions -> 'probation_months') = 'boolean' THEN staff.permissions -> 'probation_months' END,
          'staff_meta_extension',
            CASE WHEN jsonb_typeof(staff.permissions -> 'extension') = 'boolean' THEN staff.permissions -> 'extension' END
        )
      )
    ) AS entry(key, value)
    WHERE NOT (
      entry.key IN (
        'license_no',
        'license_date',
        'employment_type',
        'contract_end_date',
        'probation_months',
        'extension'
      )
      AND jsonb_typeof(entry.value) = 'boolean'
    )
  ),
  '{}'::jsonb
)
WHERE COALESCE(staff.permissions, '{}'::jsonb) ?| ARRAY[
  'license_no',
  'license_date',
  'employment_type',
  'contract_end_date',
  'probation_months',
  'extension'
];
