-- D1은 RLS 없음 — 앱 권한 검사로 이식 대상 (Phase 1F)

-- 정책 186개



-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access SM" ON staff_members FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access CO" ON companies FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access IV" ON inventory FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access BP" ON board_posts FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access DC" ON daily_closures FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access SC" ON system_configs FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access WS" ON work_shifts FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access CT" ON contract_templates FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access EC" ON employment_contracts FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access NT" ON notifications FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access LR" ON leave_requests FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access AT" ON attendance FOR ALL USING (true);

-- from: TOTAL_RECOVERY_SCHEMA.sql
CREATE POLICY "Public Access SE" ON staff_evaluations FOR ALL USING (true);

-- from: 2026-05-12_001_license_continuing_education.sql
CREATE POLICY ce_select_self_or_hr ON license_continuing_education
      FOR SELECT USING (true);

-- from: 2026-05-12_001_license_continuing_education.sql
CREATE POLICY ce_insert_self ON license_continuing_education
      FOR INSERT WITH CHECK (true);

-- from: 2026-05-12_001_license_continuing_education.sql
CREATE POLICY ce_update_hr ON license_continuing_education
      FOR UPDATE USING (true);

-- from: 2026-05-12_001_license_continuing_education.sql
CREATE POLICY ce_delete_self_or_hr ON license_continuing_education
      FOR DELETE USING (true);

-- from: 20260227_daily_closure.sql
CREATE POLICY "원무과 마감 조회 권한" ON daily_closures FOR SELECT USING (true);

-- from: 20260227_daily_closure.sql
CREATE POLICY "원무과 마감 입력 권한" ON daily_closures FOR ALL USING (true);

-- from: 20260227_daily_closure.sql
CREATE POLICY "원무과 마감 내역 조회 권한" ON daily_closure_items FOR SELECT USING (true);

-- from: 20260227_daily_closure.sql
CREATE POLICY "원무과 마감 내역 입력 권한" ON daily_closure_items FOR ALL USING (true);

-- from: 20260227_daily_closure.sql
CREATE POLICY "원무과 수표 조회 권한" ON daily_checks FOR SELECT USING (true);

-- from: 20260227_daily_closure.sql
CREATE POLICY "원무과 수표 입력 권한" ON daily_checks FOR ALL USING (true);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY push_subscriptions_select_scope
ON public.push_subscriptions
FOR SELECT
USING (public.erp_target_staff_in_scope(staff_id));

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY push_subscriptions_insert_scope
ON public.push_subscriptions
FOR INSERT
WITH CHECK (staff_id = public.erp_staff_id() OR public.erp_is_admin());

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY push_subscriptions_update_scope
ON public.push_subscriptions
FOR UPDATE
USING (staff_id = public.erp_staff_id() OR public.erp_is_admin())
WITH CHECK (staff_id = public.erp_staff_id() OR public.erp_is_admin());

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY push_subscriptions_delete_scope
ON public.push_subscriptions
FOR DELETE
USING (staff_id = public.erp_staff_id() OR public.erp_is_admin());

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY notifications_select_scope
ON public.notifications
FOR SELECT
USING (public.erp_target_staff_in_scope(user_id));

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY notifications_insert_scope
ON public.notifications
FOR INSERT
WITH CHECK (
  public.erp_is_admin()
  OR user_id = public.erp_staff_id()
  OR public.erp_target_staff_same_company(user_id)
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY notifications_update_scope
ON public.notifications
FOR UPDATE
USING (public.erp_target_staff_in_scope(user_id))
WITH CHECK (public.erp_target_staff_in_scope(user_id));

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY notifications_delete_scope
ON public.notifications
FOR DELETE
USING (public.erp_is_admin() OR user_id = public.erp_staff_id());

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY attendance_select_scope
ON public.attendance
FOR SELECT
USING (public.erp_target_staff_in_scope(staff_id));

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY attendance_insert_scope
ON public.attendance
FOR INSERT
WITH CHECK (public.erp_target_staff_in_scope(staff_id));

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY attendance_update_scope
ON public.attendance
FOR UPDATE
USING (public.erp_target_staff_in_scope(staff_id))
WITH CHECK (public.erp_target_staff_in_scope(staff_id));

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY attendance_delete_scope
ON public.attendance
FOR DELETE
USING (public.erp_is_admin() OR staff_id = public.erp_staff_id());

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY attendances_select_scope
ON public.attendances
FOR SELECT
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY attendances_insert_scope
ON public.attendances
FOR INSERT
WITH CHECK (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY attendances_update_scope
ON public.attendances
FOR UPDATE
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
)
WITH CHECK (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY attendances_delete_scope
ON public.attendances
FOR DELETE
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY leave_requests_select_scope
ON public.leave_requests
FOR SELECT
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY leave_requests_insert_scope
ON public.leave_requests
FOR INSERT
WITH CHECK (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY leave_requests_update_scope
ON public.leave_requests
FOR UPDATE
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
)
WITH CHECK (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY leave_requests_delete_scope
ON public.leave_requests
FOR DELETE
USING (
  public.erp_is_admin()
  OR staff_id = public.erp_staff_id()
  OR (
    public.erp_can_manage_company()
    AND public.erp_company_matches(company_id)
  )
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY payroll_records_select_scope
ON public.payroll_records
FOR SELECT
USING (public.erp_target_staff_in_scope(staff_id));

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY payroll_records_insert_scope
ON public.payroll_records
FOR INSERT
WITH CHECK (
  public.erp_is_admin()
  OR (
    public.erp_can_manage_company()
    AND public.erp_target_staff_same_company(staff_id)
  )
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY payroll_records_update_scope
ON public.payroll_records
FOR UPDATE
USING (
  public.erp_is_admin()
  OR (
    public.erp_can_manage_company()
    AND public.erp_target_staff_same_company(staff_id)
  )
)
WITH CHECK (
  public.erp_is_admin()
  OR (
    public.erp_can_manage_company()
    AND public.erp_target_staff_same_company(staff_id)
  )
);

-- from: 20260308_phase1_rls_personal_scope.sql
CREATE POLICY payroll_records_delete_scope
ON public.payroll_records
FOR DELETE
USING (
  public.erp_is_admin()
  OR (
    public.erp_can_manage_company()
    AND public.erp_target_staff_same_company(staff_id)
  )
);

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY companies_select_all
ON public.companies
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY companies_insert_admin
ON public.companies
FOR INSERT
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY companies_update_admin
ON public.companies
FOR UPDATE
USING (public.erp_is_admin() OR public.erp_can_manage_company())
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY companies_delete_admin
ON public.companies
FOR DELETE
USING (public.erp_is_admin());

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY corporate_cards_select
ON public.corporate_cards
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY corporate_cards_insert
ON public.corporate_cards
FOR INSERT
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY corporate_cards_update
ON public.corporate_cards
FOR UPDATE
USING (public.erp_is_admin() OR public.erp_can_manage_company())
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY corporate_cards_delete
ON public.corporate_cards
FOR DELETE
USING (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY corporate_card_transactions_select
ON public.corporate_card_transactions
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY corporate_card_transactions_insert
ON public.corporate_card_transactions
FOR INSERT
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY corporate_card_transactions_update
ON public.corporate_card_transactions
FOR UPDATE
USING (public.erp_is_admin() OR public.erp_can_manage_company())
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260319_companies_corporate_cards_rls.sql
CREATE POLICY corporate_card_transactions_delete
ON public.corporate_card_transactions
FOR DELETE
USING (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260329_board_post_status_reads.sql
create policy if not exists "board_post_reads_insert_own"
  on public.board_post_reads
  for insert
  with check (true);

-- from: 20260329_board_post_status_reads.sql
create policy if not exists "board_post_reads_update_own"
  on public.board_post_reads
  for update
  using (true);

-- from: 20260329_board_post_status_reads.sql
create policy if not exists "board_post_reads_select_all"
  on public.board_post_reads
  for select
  using (true);

-- from: 20260330_advanced_ops_foundation.sql
create policy todo_reminder_logs_select_scope
on public.todo_reminder_logs
for select
using (public.erp_target_staff_in_scope(user_id));

-- from: 20260330_advanced_ops_foundation.sql
create policy todo_reminder_logs_insert_scope
on public.todo_reminder_logs
for insert
with check (
  public.erp_is_admin()
  or user_id = public.erp_staff_id()
  or public.erp_target_staff_same_company(user_id)
);

-- from: 20260330_advanced_ops_foundation.sql
create policy todo_reminder_logs_update_scope
on public.todo_reminder_logs
for update
using (public.erp_target_staff_in_scope(user_id))
with check (public.erp_target_staff_in_scope(user_id));

-- from: 20260330_advanced_ops_foundation.sql
create policy todo_reminder_logs_delete_scope
on public.todo_reminder_logs
for delete
using (public.erp_is_admin() or user_id = public.erp_staff_id());

-- from: 20260330_advanced_ops_foundation.sql
create policy wiki_document_versions_select_scope
    on public.wiki_document_versions
    for select
    using (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );

-- from: 20260330_advanced_ops_foundation.sql
create policy wiki_document_versions_insert_scope
    on public.wiki_document_versions
    for insert
    with check (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );

-- from: 20260330_advanced_ops_foundation.sql
create policy wiki_document_versions_update_scope
    on public.wiki_document_versions
    for update
    using (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    )
    with check (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );

-- from: 20260330_advanced_ops_foundation.sql
create policy wiki_document_versions_delete_scope
    on public.wiki_document_versions
    for delete
    using (
      public.erp_is_admin()
      or company_id is null
      or public.erp_company_matches(company_id)
    );

-- from: 20260330_advanced_ops_foundation.sql
create policy backup_restore_runs_select_scope
on public.backup_restore_runs
for select
using (public.erp_is_admin());

-- from: 20260330_advanced_ops_foundation.sql
create policy backup_restore_runs_insert_scope
on public.backup_restore_runs
for insert
with check (public.erp_is_admin());

-- from: 20260330_advanced_ops_foundation.sql
create policy backup_restore_runs_update_scope
on public.backup_restore_runs
for update
using (public.erp_is_admin())
with check (public.erp_is_admin());

-- from: 20260330_advanced_ops_foundation.sql
create policy backup_restore_runs_delete_scope
on public.backup_restore_runs
for delete
using (public.erp_is_admin());

-- from: 20260330_wiki_todo_foundation.sql
create policy wiki_folders_select_scope
on public.wiki_folders
for select
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260330_wiki_todo_foundation.sql
create policy wiki_folders_insert_scope
on public.wiki_folders
for insert
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260330_wiki_todo_foundation.sql
create policy wiki_folders_update_scope
on public.wiki_folders
for update
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
)
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260330_wiki_todo_foundation.sql
create policy wiki_folders_delete_scope
on public.wiki_folders
for delete
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260330_wiki_todo_foundation.sql
create policy wiki_documents_select_scope
on public.wiki_documents
for select
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260330_wiki_todo_foundation.sql
create policy wiki_documents_insert_scope
on public.wiki_documents
for insert
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260330_wiki_todo_foundation.sql
create policy wiki_documents_update_scope
on public.wiki_documents
for update
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
)
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260330_wiki_todo_foundation.sql
create policy wiki_documents_delete_scope
on public.wiki_documents
for delete
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260331_op_check_foundation.sql
create policy op_check_templates_select_scope
on public.op_check_templates
for select
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260331_op_check_foundation.sql
create policy op_check_templates_insert_scope
on public.op_check_templates
for insert
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260331_op_check_foundation.sql
create policy op_check_templates_update_scope
on public.op_check_templates
for update
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
)
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260331_op_check_foundation.sql
create policy op_check_templates_delete_scope
on public.op_check_templates
for delete
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260331_op_check_foundation.sql
create policy op_patient_checks_select_scope
on public.op_patient_checks
for select
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260331_op_check_foundation.sql
create policy op_patient_checks_insert_scope
on public.op_patient_checks
for insert
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260331_op_check_foundation.sql
create policy op_patient_checks_update_scope
on public.op_patient_checks
for update
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
)
with check (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260331_op_check_foundation.sql
create policy op_patient_checks_delete_scope
on public.op_patient_checks
for delete
using (
  public.erp_is_admin()
  or company_id is null
  or public.erp_company_matches(company_id)
);

-- from: 20260403_roster_policy_settings.sql
create policy roster_policy_settings_select_scope
on public.roster_policy_settings
for select
using (
  public.erp_is_admin()
  or (
    public.erp_can_manage_company()
    and (
      company_id is null
      or public.erp_company_matches(company_id)
    )
  )
);

-- from: 20260403_roster_policy_settings.sql
create policy roster_policy_settings_insert_scope
on public.roster_policy_settings
for insert
with check (
  public.erp_is_admin()
  or (
    public.erp_can_manage_company()
    and (
      company_id is null
      or public.erp_company_matches(company_id)
    )
  )
);

-- from: 20260403_roster_policy_settings.sql
create policy roster_policy_settings_update_scope
on public.roster_policy_settings
for update
using (
  public.erp_is_admin()
  or (
    public.erp_can_manage_company()
    and (
      company_id is null
      or public.erp_company_matches(company_id)
    )
  )
)
with check (
  public.erp_is_admin()
  or (
    public.erp_can_manage_company()
    and (
      company_id is null
      or public.erp_company_matches(company_id)
    )
  )
);

-- from: 20260403_roster_policy_settings.sql
create policy roster_policy_settings_delete_scope
on public.roster_policy_settings
for delete
using (
  public.erp_is_admin()
  or (
    public.erp_can_manage_company()
    and (
      company_id is null
      or public.erp_company_matches(company_id)
    )
  )
);

-- from: 20260403_roster_workflow_requests.sql
create policy roster_approval_requests_select_scope
on public.roster_approval_requests
for select
using (
  requested_by = public.erp_staff_id()
  or public.erp_is_roster_approver()
);

-- from: 20260403_roster_workflow_requests.sql
create policy roster_approval_requests_insert_scope
on public.roster_approval_requests
for insert
with check (
  requested_by = public.erp_staff_id()
  or public.erp_is_roster_approver()
);

-- from: 20260403_roster_workflow_requests.sql
create policy roster_approval_requests_update_scope
on public.roster_approval_requests
for update
using (public.erp_is_roster_approver())
with check (public.erp_is_roster_approver());

-- from: 20260403_roster_workflow_requests.sql
create policy roster_approval_requests_delete_scope
on public.roster_approval_requests
for delete
using (public.erp_is_admin() or requested_by = public.erp_staff_id());

-- from: 20260403_roster_workflow_requests.sql
create policy roster_swap_requests_select_scope
on public.roster_swap_requests
for select
using (
  requested_by = public.erp_staff_id()
  or staff_id = public.erp_staff_id()
  or public.erp_is_roster_approver()
);

-- from: 20260403_roster_workflow_requests.sql
create policy roster_swap_requests_insert_scope
on public.roster_swap_requests
for insert
with check (
  requested_by = public.erp_staff_id()
  or staff_id = public.erp_staff_id()
  or public.erp_is_roster_approver()
);

-- from: 20260403_roster_workflow_requests.sql
create policy roster_swap_requests_update_scope
on public.roster_swap_requests
for update
using (public.erp_is_roster_approver())
with check (public.erp_is_roster_approver());

-- from: 20260403_roster_workflow_requests.sql
create policy roster_swap_requests_delete_scope
on public.roster_swap_requests
for delete
using (public.erp_is_admin() or requested_by = public.erp_staff_id());

-- from: 20260408_preferred_off_monthly_quota.sql
CREATE POLICY "authenticated_all_staff_preferred_off"
  ON staff_preferred_off FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- from: 20260408_preferred_off_monthly_quota.sql
CREATE POLICY "authenticated_all_monthly_off_quota"
  ON monthly_off_quota FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create policy department_private_inventory_items_select_scope
on public.department_private_inventory_items
for select
using (public.erp_department_inventory_scope_matches(company, company_id, department));

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create policy department_private_inventory_items_insert_scope
on public.department_private_inventory_items
for insert
with check (public.erp_department_inventory_scope_matches(company, company_id, department));

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create policy department_private_inventory_items_update_scope
on public.department_private_inventory_items
for update
using (public.erp_department_inventory_scope_matches(company, company_id, department))
with check (public.erp_department_inventory_scope_matches(company, company_id, department));

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create policy department_private_inventory_items_delete_scope
on public.department_private_inventory_items
for delete
using (public.erp_department_inventory_scope_matches(company, company_id, department));

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create policy department_private_inventory_logs_select_scope
on public.department_private_inventory_logs
for select
using (public.erp_department_inventory_scope_matches(company, company_id, department));

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create policy department_private_inventory_logs_insert_scope
on public.department_private_inventory_logs
for insert
with check (
  public.erp_department_inventory_scope_matches(company, company_id, department)
  and exists (
    select 1
    from public.department_private_inventory_items as item
    where item.id = department_private_inventory_logs.item_id
      and lower(btrim(item.company)) = lower(btrim(department_private_inventory_logs.company))
      and lower(btrim(item.department)) = lower(btrim(department_private_inventory_logs.department))
      and public.erp_department_inventory_scope_matches(item.company, item.company_id, item.department)
      and (
        item.company_id is null
        or department_private_inventory_logs.company_id is null
        or item.company_id = department_private_inventory_logs.company_id
      )
  )
);

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create policy department_private_inventory_logs_update_admin
on public.department_private_inventory_logs
for update
using (public.erp_is_admin())
with check (public.erp_is_admin());

-- from: 20260423_department_inventory_rls_and_log_scope.sql
create policy department_private_inventory_logs_delete_admin
on public.department_private_inventory_logs
for delete
using (public.erp_is_admin());

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_select_scope on public.inventory
for select
using (public.erp_inventory_scope_matches(company, company_id, department));

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_insert_scope on public.inventory
for insert
with check (
  public.erp_can_manage_all_inventory_companies()
  or (
    public.erp_can_manage_department_inventory()
    and public.erp_inventory_scope_matches(company, company_id, department)
  )
);

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_update_scope on public.inventory
for update
using (public.erp_inventory_scope_matches(company, company_id, department))
with check (
  public.erp_can_manage_all_inventory_companies()
  or (
    public.erp_can_manage_department_inventory()
    and public.erp_inventory_scope_matches(company, company_id, department)
  )
);

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_delete_scope on public.inventory
for delete
using (public.erp_can_manage_all_inventory_companies());

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_logs_select_scope on public.inventory_logs
for select
using (public.erp_inventory_scope_matches(company, company_id, department));

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_logs_insert_scope on public.inventory_logs
for insert
with check (public.erp_inventory_scope_matches(company, company_id, department));

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_transfers_select_scope on public.inventory_transfers
for select
using (
  public.erp_inventory_scope_matches(from_company, null, from_department)
  or public.erp_inventory_scope_matches(to_company, null, to_department)
);

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_transfers_insert_scope on public.inventory_transfers
for insert
with check (
  public.erp_inventory_scope_matches(from_company, null, from_department)
  and public.erp_inventory_scope_matches(to_company, null, to_department)
);

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy purchase_orders_select_scope on public.purchase_orders
for select
using (
  public.erp_can_view_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
);

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy purchase_orders_write_scope on public.purchase_orders
for all
using (
  public.erp_can_manage_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
)
with check (
  public.erp_can_manage_all_inventory_companies()
  or public.erp_inventory_scope_matches(requester_company, null, requester_department)
);

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy delivery_confirmations_select_scope on public.delivery_confirmations
for select
using (public.erp_inventory_company_scope_matches(receiver_company, null));

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy delivery_confirmations_write_scope on public.delivery_confirmations
for all
using (public.erp_inventory_company_scope_matches(receiver_company, null))
with check (public.erp_inventory_company_scope_matches(receiver_company, null));

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_price_history_select_scope on public.inventory_price_history
for select
using (
  exists (
    select 1
    from public.inventory as i
    where i.id = inventory_price_history.inventory_item_id
      and public.erp_inventory_scope_matches(i.company, i.company_id, i.department)
  )
);

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_price_history_insert_scope on public.inventory_price_history
for insert
with check (
  exists (
    select 1
    from public.inventory as i
    where i.id = inventory_price_history.inventory_item_id
      and public.erp_inventory_scope_matches(i.company, i.company_id, i.department)
  )
);

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_count_sessions_select_scope on public.inventory_count_sessions
for select
using (public.erp_inventory_scope_matches(company, company_id, department));

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_count_sessions_insert_scope on public.inventory_count_sessions
for insert
with check (public.erp_inventory_scope_matches(company, company_id, department));

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_cost_entries_select_scope on public.inventory_cost_entries
for select
using (public.erp_inventory_scope_matches(company_name, company_id, department));

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_cost_entries_insert_scope on public.inventory_cost_entries
for insert
with check (public.erp_inventory_scope_matches(company_name, company_id, department));

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_closing_snapshots_select_scope on public.inventory_closing_snapshots
for select
using (public.erp_inventory_company_scope_matches(company, company_id));

-- from: 20260423_z_inventory_scope_accounting_closing_rls.sql
create policy inventory_closing_snapshots_insert_scope on public.inventory_closing_snapshots
for insert
with check (public.erp_inventory_company_scope_matches(company, company_id));

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy staff_members_select_authenticated
on public.staff_members
for select
to authenticated
using (true);

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy staff_members_insert_manage
on public.staff_members
for insert
to authenticated
with check (public.erp_is_admin() or public.erp_can_manage_company());

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy staff_members_update_scope
on public.staff_members
for update
to authenticated
using (
  public.erp_is_admin()
  or id = public.erp_staff_id()
  or (
    public.erp_can_manage_company()
    and (
      public.erp_company_matches(company_id)
      or public.erp_company_name_matches(company)
    )
  )
)
with check (
  public.erp_is_admin()
  or id = public.erp_staff_id()
  or (
    public.erp_can_manage_company()
    and (
      public.erp_company_matches(company_id)
      or public.erp_company_name_matches(company)
    )
  )
);

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy staff_members_delete_admin
on public.staff_members
for delete
to authenticated
using (public.erp_is_admin());

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy approvals_select_scope
on public.approvals
for select
to authenticated
using (
  public.erp_is_admin()
  or sender_id = public.erp_staff_id()
  or current_approver_id = public.erp_staff_id()
  or public.erp_company_matches(company_id)
);

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy approvals_insert_scope
on public.approvals
for insert
to authenticated
with check (
  public.erp_is_admin()
  or sender_id = public.erp_staff_id()
  or (
    public.erp_can_manage_company()
    and public.erp_company_matches(company_id)
  )
);

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy approvals_update_scope
on public.approvals
for update
to authenticated
using (
  public.erp_is_admin()
  or sender_id = public.erp_staff_id()
  or current_approver_id = public.erp_staff_id()
  or (
    public.erp_can_manage_company()
    and public.erp_company_matches(company_id)
  )
)
with check (
  public.erp_is_admin()
  or sender_id = public.erp_staff_id()
  or current_approver_id = public.erp_staff_id()
  or (
    public.erp_can_manage_company()
    and public.erp_company_matches(company_id)
  )
);

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy approvals_delete_scope
on public.approvals
for delete
to authenticated
using (
  public.erp_is_admin()
  or sender_id = public.erp_staff_id()
);

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy notifications_select_scope
on public.notifications
for select
to authenticated
using (public.erp_target_staff_in_scope(user_id));

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy notifications_insert_scope
on public.notifications
for insert
to authenticated
with check (
  public.erp_is_admin()
  or user_id = public.erp_staff_id()
  or public.erp_target_staff_same_company(user_id)
);

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy notifications_update_scope
on public.notifications
for update
to authenticated
using (public.erp_target_staff_in_scope(user_id))
with check (public.erp_target_staff_in_scope(user_id));

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy notifications_delete_scope
on public.notifications
for delete
to authenticated
using (public.erp_is_admin() or user_id = public.erp_staff_id());

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy %I on public.%I for select to authenticated using (public.erp_target_staff_in_scope(staff_id))',
        table_name || '_select_scope',
        table_name
      );

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy %I on public.%I for insert to authenticated with check (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id)))',
        table_name || '_insert_scope',
        table_name
      );

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy %I on public.%I for update to authenticated using (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id))) with check (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id)))',
        table_name || '_update_scope',
        table_name
      );

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy %I on public.%I for delete to authenticated using (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_target_staff_same_company(staff_id)))',
        table_name || '_delete_scope',
        table_name
      );

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy %I on public.%I for select to authenticated using (public.erp_company_name_matches(company_name))',
        table_name || '_select_scope',
        table_name
      );

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy %I on public.%I for all to authenticated using (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_company_name_matches(company_name))) with check (public.erp_is_admin() or (public.erp_can_manage_company() and public.erp_company_name_matches(company_name)))',
        table_name || '_write_scope',
        table_name
      );

-- from: 20260505_enable_rls_for_public_advisor.sql
create policy %I on %I.%I for all to authenticated using (true) with check (true)',
      'authenticated_access',
      target_table.schema_name,
      target_table.table_name
    );

-- from: 20260506_board_posts_delete_author_admin.sql
create policy board_posts_select_authenticated
on public.board_posts
for select
to authenticated
using (true);

-- from: 20260506_board_posts_delete_author_admin.sql
create policy board_posts_insert_authenticated
on public.board_posts
for insert
to authenticated
with check (true);

-- from: 20260506_board_posts_delete_author_admin.sql
create policy board_posts_update_authenticated
on public.board_posts
for update
to authenticated
using (true)
with check (true);

-- from: 20260506_board_posts_delete_author_admin.sql
create policy board_posts_delete_author_admin
on public.board_posts
for delete
to authenticated
using (
  public.erp_is_admin()
  or author_id = public.erp_staff_id()
);

-- from: 20260506_insurance_records.sql
CREATE POLICY insurance_records_select_scope
ON public.insurance_records
FOR SELECT
USING (public.erp_target_staff_in_scope(staff_id));

-- from: 20260506_insurance_records.sql
CREATE POLICY insurance_records_insert_scope
ON public.insurance_records
FOR INSERT
WITH CHECK (public.erp_target_staff_in_scope(staff_id));

-- from: 20260506_insurance_records.sql
CREATE POLICY insurance_records_update_scope
ON public.insurance_records
FOR UPDATE
USING (public.erp_target_staff_in_scope(staff_id))
WITH CHECK (public.erp_target_staff_in_scope(staff_id));

-- from: 20260506_insurance_records.sql
CREATE POLICY insurance_records_delete_scope
ON public.insurance_records
FOR DELETE
USING (public.erp_target_staff_in_scope(staff_id));

-- from: 20260508_runtime_log_error_cleanup.sql
create policy system_configs_runtime_read
      on public.system_configs
      for select
      to anon, authenticated
      using (true);

-- from: 20260508_runtime_log_error_cleanup.sql
create policy popups_runtime_all
      on public.popups
      for all
      to anon, authenticated
      using (true)
      with check (true);

-- from: 20260508_runtime_log_error_cleanup.sql
create policy messages_runtime_all
      on public.messages
      for all
      to anon, authenticated
      using (true)
      with check (true);

-- from: 20260508_runtime_log_error_cleanup.sql
create policy notifications_runtime_all
      on public.notifications
      for all
      to anon, authenticated
      using (true)
      with check (true);

-- from: 20260510_company_holidays.sql
create policy company_holidays_select
on public.company_holidays
for select
using (auth.uid() is not null);

-- from: 20260510_company_holidays.sql
create policy company_holidays_insert
on public.company_holidays
for insert
with check (public.erp_is_admin() or public.erp_can_manage_company());

-- from: 20260510_company_holidays.sql
create policy company_holidays_update
on public.company_holidays
for update
using (public.erp_is_admin() or public.erp_can_manage_company())
with check (public.erp_is_admin() or public.erp_can_manage_company());

-- from: 20260510_company_holidays.sql
create policy company_holidays_delete
on public.company_holidays
for delete
using (public.erp_is_admin() or public.erp_can_manage_company());

-- from: 20260510_company_scoped_approval_forms.sql
CREATE POLICY company_seals_select
ON public.company_seals
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- from: 20260510_company_scoped_approval_forms.sql
CREATE POLICY company_seals_insert
ON public.company_seals
FOR INSERT
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260510_company_scoped_approval_forms.sql
CREATE POLICY company_seals_update
ON public.company_seals
FOR UPDATE
USING (public.erp_is_admin() OR public.erp_can_manage_company())
WITH CHECK (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260510_company_scoped_approval_forms.sql
CREATE POLICY company_seals_delete
ON public.company_seals
FOR DELETE
USING (public.erp_is_admin() OR public.erp_can_manage_company());

-- from: 20260510_company_scoped_approval_forms.sql
CREATE POLICY company_seals_storage_select
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'company-seals');

-- from: 20260510_company_scoped_approval_forms.sql
CREATE POLICY company_seals_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-seals'
  AND (public.erp_is_admin() OR public.erp_can_manage_company())
);

-- from: 20260510_company_scoped_approval_forms.sql
CREATE POLICY company_seals_storage_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-seals'
  AND (public.erp_is_admin() OR public.erp_can_manage_company())
)
WITH CHECK (
  bucket_id = 'company-seals'
  AND (public.erp_is_admin() OR public.erp_can_manage_company())
);

-- from: storage_board_attachments.sql
create policy "board_attachments_insert"
on storage.objects for insert to public
with check (bucket_id = 'board-attachments');

-- from: storage_board_attachments.sql
create policy "board_attachments_insert_auth"
on storage.objects for insert to authenticated
with check (bucket_id = 'board-attachments');

-- from: storage_board_attachments.sql
create policy "board_attachments_select"
on storage.objects for select to public
using (bucket_id = 'board-attachments');

-- from: storage_chat_attachments.sql
create policy "chat_attachments_insert_public"
on storage.objects for insert to public
with check (bucket_id = 'pchos-files');

-- from: storage_chat_attachments.sql
create policy "chat_attachments_insert_auth"
on storage.objects for insert to authenticated
with check (bucket_id = 'pchos-files');

-- from: storage_chat_attachments.sql
create policy "chat_attachments_select_public"
on storage.objects for select to public
using (bucket_id = 'pchos-files');

-- from: storage_document_pdfs.sql
create policy "document_pdfs_insert"
on storage.objects for insert to public
with check (bucket_id = 'document-pdfs');

-- from: storage_document_pdfs.sql
create policy "document_pdfs_insert_auth"
on storage.objects for insert to authenticated
with check (bucket_id = 'document-pdfs');

-- from: storage_document_pdfs.sql
create policy "document_pdfs_select"
on storage.objects for select to public
using (bucket_id = 'document-pdfs');

-- from: storage_profiles_policies.sql
create policy "profiles_allow_insert"
on storage.objects for insert
to public
with check (bucket_id = 'profiles');

-- from: storage_profiles_policies.sql
create policy "profiles_allow_select"
on storage.objects for select
to public
using (bucket_id = 'profiles');

-- from: storage_profiles_policies.sql
create policy "profiles_allow_update"
on storage.objects for update
to public
using (bucket_id = 'profiles');