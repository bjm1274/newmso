-- D1에서는 사용하지 않음 — 앱 레이어에서 매번 호출

-- 트리거 24개



-- from: 00_full_schema_and_migrations.sql
CREATE TRIGGER tr_inventory_sync BEFORE INSERT OR UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION sync_inventory_name_stock();

-- from: 20260308_messenger_payroll_persistence.sql
CREATE TRIGGER trg_messenger_drive_links_updated_at
BEFORE UPDATE ON messenger_drive_links
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

-- from: 20260308_messenger_payroll_persistence.sql
CREATE TRIGGER trg_payroll_bonus_items_updated_at
BEFORE UPDATE ON payroll_bonus_items
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

-- from: 20260308_messenger_payroll_persistence.sql
CREATE TRIGGER trg_payroll_retro_adjustments_updated_at
BEFORE UPDATE ON payroll_retro_adjustments
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

-- from: 20260308_messenger_payroll_persistence.sql
CREATE TRIGGER trg_payroll_deduction_controls_updated_at
BEFORE UPDATE ON payroll_deduction_controls
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

-- from: 20260308_messenger_payroll_persistence.sql
CREATE TRIGGER trg_freelancer_payments_updated_at
BEFORE UPDATE ON freelancer_payments
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

-- from: 20260308_messenger_payroll_persistence.sql
CREATE TRIGGER trg_payroll_calendar_items_updated_at
BEFORE UPDATE ON payroll_calendar_items
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

-- from: 20260308_messenger_payroll_persistence.sql
CREATE TRIGGER trg_payroll_approval_workflows_updated_at
BEFORE UPDATE ON payroll_approval_workflows
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

-- from: 20260325_chat_push_jobs.sql
create trigger trigger_messages_enqueue_chat_push
  after insert on public.messages
  for each row
  execute procedure public.enqueue_chat_push_job();

-- from: 20260327_asset_loan_item_settings.sql
create trigger trg_asset_loan_item_settings_updated_at
before update on public.asset_loan_item_settings
for each row
execute function public.touch_asset_loan_item_settings_updated_at();

-- from: 20260327_staff_member_duplicate_identity_guard.sql
create trigger trg_prevent_duplicate_staff_member_identity
before insert or update of name, resident_no
on public.staff_members
for each row
execute function public.prevent_duplicate_staff_member_identity();

-- from: 20260330_chat_room_last_message_resync.sql
create trigger trigger_messages_update_room_last
  after insert or delete or update of content, file_name, file_url, is_deleted
  on public.messages
  for each row
  execute function public.refresh_chat_room_last_message();

-- from: 20260403_roster_policy_settings.sql
create trigger trg_roster_policy_settings_updated_at
before update on public.roster_policy_settings
for each row
execute function public.touch_roster_policy_settings_updated_at();

-- from: 20260403_roster_workflow_requests.sql
create trigger trg_roster_approval_requests_updated_at
before update on public.roster_approval_requests
for each row
execute function public.set_row_updated_at();

-- from: 20260403_roster_workflow_requests.sql
create trigger trg_roster_swap_requests_updated_at
before update on public.roster_swap_requests
for each row
execute function public.set_row_updated_at();

-- from: 20260422_department_private_inventory.sql
create trigger department_private_inventory_updated_at
before update on public.department_private_inventory_items
for each row execute function public.set_department_private_inventory_updated_at();

-- from: 20260506_board_posts_updated_at.sql
create trigger trg_board_posts_updated_at
before update on public.board_posts
for each row
execute function public.touch_board_posts_updated_at();

-- from: 20260508_required_operational_feature_tables.sql
create trigger trg_report_schedules_updated_at
before update on public.report_schedules
for each row
execute function public.set_row_updated_at();

-- from: 20260508_required_operational_feature_tables.sql
create trigger trg_virtual_account_deposits_updated_at
before update on public.virtual_account_deposits
for each row
execute function public.set_row_updated_at();

-- from: 20260508_required_operational_feature_tables.sql
create trigger trg_company_expenses_updated_at
before update on public.company_expenses
for each row
execute function public.set_row_updated_at();

-- from: 20260508_required_operational_feature_tables.sql
create trigger trg_tax_reports_updated_at
before update on public.tax_reports
for each row
execute function public.set_row_updated_at();

-- from: 20260508_required_operational_feature_tables.sql
create trigger trg_retirement_pensions_updated_at
before update on public.retirement_pensions
for each row
execute function public.set_row_updated_at();

-- from: 20260508_required_operational_feature_tables.sql
create trigger trg_inventory_categories_updated_at
before update on public.inventory_categories
for each row
execute function public.set_row_updated_at();

-- from: chat_rooms_last_message.sql
CREATE TRIGGER trigger_messages_update_room_last
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE PROCEDURE update_chat_room_last_message();