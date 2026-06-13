-- Migration 0016: Add resignation form and seed default form types if missing
INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-leave', '연차/휴가', 'leave', 1, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'leave');

INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-overtime', '연장근무', 'overtime', 2, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'overtime');

INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-purchase', '비품구매', 'purchase', 3, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'purchase');

INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-attendance-fix', '출결정정', 'attendance_fix', 4, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'attendance_fix');

INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-generic', '증명서발급', 'generic', 5, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'generic');

INSERT INTO approval_form_types (id, name, slug, sort_order, is_active, company_name)
SELECT 'default-resignation', '사직서', 'resignation', 6, 1, NULL
WHERE NOT EXISTS (SELECT 1 FROM approval_form_types WHERE slug = 'resignation');
