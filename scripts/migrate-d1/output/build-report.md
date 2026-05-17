# D1 스키마 변환 리포트

생성일: 2026-05-17T05:28:51.389Z
소스 SQL 파일: 107
생성된 테이블: 116
ALTER 통합 후보: 281
인덱스: 209
추출된 함수: 49
추출된 트리거: 24
추출된 정책: 186
추출된 DO 블록: 54
제외된 테이블: attendances_20260513_bulk_backup

## 파일별 처리 결과

| 파일 | 테이블 | ALTER | INDEX | FUNCTION | POLICY |
|---|---:|---:|---:|---:|---:|
| TOTAL_RECOVERY_SCHEMA.sql | 28 | 0 | 9 | 0 | 13 |
| 2026-05-11_001_staff_licenses_enhance.sql | 1 | 10 | 3 | 0 | 0 |
| 2026-05-11_002_job_categories.sql | 2 | 0 | 2 | 0 | 0 |
| 2026-05-11_003_job_category_required_trainings.sql | 1 | 0 | 2 | 0 | 0 |
| 2026-05-11_004_leave_balances.sql | 1 | 4 | 2 | 0 | 0 |
| 2026-05-11_005_staff_shift_assignments.sql | 1 | 0 | 3 | 0 | 0 |
| 2026-05-11_006_companies_leave_policy.sql | 0 | 6 | 0 | 0 | 0 |
| 2026-05-11_007_annual_leave_promotion_logs.sql | 1 | 7 | 3 | 0 | 0 |
| 2026-05-11_010_register_staff_rpc.sql | 0 | 0 | 0 | 1 | 0 |
| 2026-05-11_020_staff_trainings.sql | 1 | 0 | 3 | 0 | 0 |
| 2026-05-12_001_leave_balances_compensated_days.sql | 0 | 2 | 0 | 0 | 0 |
| 2026-05-12_001_license_continuing_education.sql | 1 | 15 | 4 | 0 | 4 |
| 00_full_schema_and_migrations.sql | 34 | 16 | 14 | 5 | 0 |
| 01_additional_features.sql | 3 | 0 | 0 | 0 | 0 |
| 02_inventory_spec_insurance.sql | 0 | 1 | 0 | 0 | 0 |
| 20260227_daily_closure.sql | 3 | 0 | 0 | 0 | 6 |
| 20260308_auth_company_foundation.sql | 0 | 6 | 7 | 0 | 0 |
| 20260308_messenger_payroll_persistence.sql | 8 | 0 | 12 | 1 | 0 |
| 20260308_phase1_rls_personal_scope.sql | 0 | 0 | 0 | 8 | 24 |
| 20260316_handover_notes_patient_scope.sql | 0 | 1 | 2 | 0 | 0 |
| 20260319_companies_corporate_cards_rls.sql | 0 | 0 | 0 | 0 | 12 |
| 20260319_virtual_account_deposits.sql | 1 | 0 | 3 | 0 | 0 |
| 20260325_chat_push_jobs.sql | 1 | 0 | 2 | 1 | 0 |
| 20260325_chat_push_queue_hardening.sql | 0 | 1 | 1 | 0 | 0 |
| 20260327_asset_loan_item_settings.sql | 1 | 0 | 0 | 1 | 0 |
| 20260327_push_subscription_device_and_chat_notification_cleanup.sql | 0 | 1 | 1 | 0 | 0 |
| 20260327_staff_member_duplicate_identity_guard.sql | 0 | 0 | 0 | 1 | 0 |
| 20260329_board_post_status_reads.sql | 1 | 1 | 2 | 0 | 3 |
| 20260329_payroll_governance.sql | 1 | 1 | 2 | 0 | 0 |
| 20260330_advanced_ops_foundation.sql | 3 | 1 | 5 | 0 | 12 |
| 20260330_chat_room_last_message_resync.sql | 0 | 2 | 0 | 1 | 0 |
| 20260330_inventory_serial_tracking.sql | 0 | 3 | 3 | 0 | 0 |
| 20260330_messages_album.sql | 0 | 1 | 1 | 0 | 0 |
| 20260330_wiki_todo_foundation.sql | 2 | 1 | 5 | 0 | 8 |
| 20260331_chat_notification_legacy_cleanup.sql | 0 | 0 | 0 | 0 | 0 |
| 20260331_inventory_unit_support.sql | 0 | 1 | 0 | 0 | 0 |
| 20260331_op_check_foundation.sql | 2 | 0 | 5 | 0 | 8 |
| 20260331_op_check_timestamps.sql | 0 | 1 | 1 | 0 | 0 |
| 20260403_roster_policy_settings.sql | 1 | 0 | 3 | 1 | 4 |
| 20260403_roster_workflow_requests.sql | 2 | 0 | 4 | 1 | 8 |
| 20260403_staff_payroll_allowance_columns.sql | 0 | 2 | 0 | 0 | 0 |
| 20260407_staff_working_hours_decimal.sql | 0 | 0 | 0 | 0 | 0 |
| 20260407_tax_insurance_rates_2026_update.sql | 0 | 0 | 0 | 0 | 0 |
| 20260408_preferred_off_monthly_quota.sql | 2 | 0 | 4 | 0 | 2 |
| 20260413_board_comments_parent_comment_id.sql | 0 | 1 | 1 | 0 | 0 |
| 20260415_chat_room_prefs_and_message_columns.sql | 1 | 1 | 2 | 0 | 0 |
| 20260415_staff_birth_permissions_and_approval_sender_department.sql | 0 | 2 | 0 | 0 | 0 |
| 20260416_push_subscriptions_device_columns_and_dedupe.sql | 0 | 1 | 4 | 0 | 0 |
| 20260416_zz_push_subscription_legacy_fcm_cleanup.sql | 0 | 0 | 0 | 0 | 0 |
| 20260422_department_private_inventory.sql | 2 | 2 | 4 | 1 | 0 |
| 20260423_department_inventory_rls_and_log_scope.sql | 0 | 1 | 1 | 5 | 8 |
| 20260423_inventory_workflow_automation_and_procurement.sql | 6 | 4 | 19 | 0 | 0 |
| 20260423_z_inventory_scope_accounting_closing_rls.sql | 0 | 2 | 3 | 6 | 20 |
| 20260424_todos_chat_source_columns.sql | 0 | 1 | 1 | 0 | 0 |
| 20260428_board_comment_anonymous.sql | 0 | 1 | 0 | 0 | 0 |
| 20260428_inventory_keywords.sql | 0 | 1 | 0 | 0 | 0 |
| 20260430_payroll_record_type_unique.sql | 0 | 2 | 1 | 0 | 0 |
| 20260430_tax_insurance_rates_precision_fix.sql | 0 | 0 | 0 | 0 | 0 |
| 20260504_chat_board_loading_indexes.sql | 0 | 0 | 9 | 0 | 0 |
| 20260505_enable_rls_for_public_advisor.sql | 0 | 0 | 0 | 12 | 19 |
| 20260506_board_posts_delete_author_admin.sql | 0 | 0 | 0 | 0 | 4 |
| 20260506_board_posts_updated_at.sql | 0 | 1 | 0 | 1 | 0 |
| 20260506_insurance_records.sql | 1 | 0 | 3 | 0 | 4 |
| 20260507_companies_payment_day.sql | 0 | 1 | 0 | 0 | 0 |
| 20260507_salary_change_history_proration.sql | 0 | 0 | 1 | 0 | 0 |
| 20260508_required_operational_feature_tables.sql | 8 | 85 | 16 | 1 | 0 |
| 20260508_runtime_log_error_cleanup.sql | 1 | 13 | 3 | 0 | 4 |
| 20260508_staff_permission_meta_key_cleanup.sql | 0 | 0 | 0 | 0 | 0 |
| 20260510_company_holidays.sql | 1 | 0 | 1 | 0 | 4 |
| 20260510_company_scoped_approval_forms.sql | 2 | 2 | 3 | 0 | 7 |
| additional_features.sql | 4 | 9 | 3 | 0 | 0 |
| advanced_features.sql | 6 | 10 | 4 | 0 | 0 |
| annual_leave_promotion_logs.sql | 1 | 0 | 1 | 0 | 0 |
| approval_form_types.sql | 1 | 0 | 1 | 0 | 0 |
| attendance_payroll_integration.sql | 1 | 4 | 0 | 0 | 0 |
| board_comments_replies.sql | 0 | 1 | 0 | 0 | 0 |
| board_posts_attachments.sql | 0 | 1 | 0 | 0 | 0 |
| board_posts_schedule_columns.sql | 0 | 9 | 0 | 0 | 0 |
| board_workboard_updates.sql | 2 | 4 | 0 | 0 | 0 |
| chat_retention_and_file_meta.sql | 0 | 2 | 0 | 1 | 0 |
| chat_rooms_last_message.sql | 0 | 2 | 0 | 1 | 0 |
| companies_business_columns.sql | 0 | 5 | 0 | 0 | 0 |
| contract_templates_seal_url.sql | 1 | 1 | 0 | 0 | 0 |
| corporate_cards_company.sql | 1 | 1 | 1 | 0 | 0 |
| hr_cert_asset_card_calendar.sql | 3 | 0 | 5 | 0 | 0 |
| hr_certificate_types_expand.sql | 0 | 0 | 0 | 0 | 0 |
| hr_full_features.sql | 7 | 7 | 5 | 0 | 0 |
| hr_interim_taxfree_upgrade.sql | 1 | 4 | 0 | 0 | 0 |
| hr_phase1_attendance_leave_shifts.sql | 3 | 0 | 6 | 0 | 0 |
| messenger_enhancements.sql | 0 | 4 | 0 | 0 | 0 |
| notifications_metadata.sql | 0 | 1 | 0 | 0 | 0 |
| org_structure.sql | 1 | 0 | 0 | 0 | 0 |
| payroll_advance_pay.sql | 0 | 1 | 0 | 0 | 0 |
| payroll_deduction_detail.sql | 0 | 1 | 0 | 0 | 0 |
| payroll_night_duty_allowance.sql | 0 | 2 | 0 | 0 | 0 |
| popups_setup.sql | 1 | 0 | 1 | 0 | 0 |
| shift_assignments_daily.sql | 1 | 0 | 2 | 0 | 0 |
| staff_members_allowances_columns.sql | 0 | 3 | 0 | 0 | 0 |
| staff_members_avatar_url.sql | 0 | 1 | 0 | 0 | 0 |
| staff_members_extension.sql | 0 | 1 | 0 | 0 | 0 |
| storage_board_attachments.sql | 0 | 0 | 0 | 0 | 3 |
| storage_chat_attachments.sql | 0 | 0 | 0 | 0 | 3 |
| storage_document_pdfs.sql | 0 | 0 | 0 | 0 | 3 |
| storage_profiles_policies.sql | 0 | 0 | 0 | 0 | 3 |
| surgery_mri_templates_body_part.sql | 0 | 2 | 0 | 0 | 0 |
| verify_payroll_columns.sql | 0 | 0 | 0 | 0 | 0 |
| work_shift_break_and_contract_columns.sql | 0 | 0 | 0 | 0 | 0 |

## 다음 단계

1. `output/d1_schema.sql`을 SQLite로 dry-run:
   ```bash
   sqlite3 /tmp/d1_test.db ".read scripts/migrate-d1/output/d1_schema.sql"
   sqlite3 /tmp/d1_test.db ".schema" | head -200
   ```
2. 오류 발생 시 변환 규칙(`pgToSqlite`) 보완 후 재실행
3. `extracted_functions.sql`의 9개 비즈니스 함수를 TS로 재작성 (Phase 1E)
4. `extracted_policies.sql`의 175개 정책을 앱 권한 검사로 이식 (Phase 1F)
5. `wrangler d1 execute --local <DB> --file output/d1_schema.sql`로 로컬 D1 적용 검증