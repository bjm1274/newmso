import { relations } from "drizzle-orm/relations";
import { staff_members, approval_delegation, approvals, companies, attendance, backup_restore_runs, board_posts, board_post_comments, board_post_reads, certificate_issuances, chat_messages, chat_rooms, chat_push_jobs, messages, chat_room_prefs, corporate_cards, corporate_card_transactions, daily_closures, daily_checks, daily_closure_items, department_private_inventory_items, department_private_inventory_logs, medical_devices, device_inspections, document_repository, document_versions, education_records, employment_contracts, freelancer_payments, insurance_records, suppliers, inventory, inventory_categories, inventory_closing_snapshots, inventory_cost_entries, purchase_orders, inventory_count_sessions, inventory_logs, inventory_price_history, inventory_receipts, inventory_transfers, job_categories, job_category_required_trainings, leave_balances, leave_requests, license_continuing_education, staff_licenses, meeting_bookings, message_bookmarks, message_reads, messenger_drive_links, notifications, op_check_templates, op_patient_checks, payroll, payroll_approval_logs, payroll_approval_workflows, payroll_bonus_items, payroll_calendar_items, payroll_deduction_controls, payroll_locks, payroll_policy_versions, payroll_retro_adjustments, polls, poll_votes, posts, roster_approval_requests, roster_policy_settings, roster_swap_requests, work_shifts, scheduled_messages, staff_certifications, staff_evaluations, staff_job_categories, staff_preferred_off, staff_shift_assignments, staff_trainings, staff_transfer_history, todo_reminder_logs, wiki_document_versions, wiki_documents, wiki_folders } from "./schema";

export const approval_delegationRelations = relations(approval_delegation, ({one}) => ({
	staff_member_delegate_id: one(staff_members, {
		fields: [approval_delegation.delegate_id],
		references: [staff_members.id],
		relationName: "approval_delegation_delegate_id_staff_members_id"
	}),
	staff_member_delegator_id: one(staff_members, {
		fields: [approval_delegation.delegator_id],
		references: [staff_members.id],
		relationName: "approval_delegation_delegator_id_staff_members_id"
	}) }));

export const staff_membersRelations = relations(staff_members, ({one, many}) => ({
	approval_delegations_delegate_id: many(approval_delegation, {
		relationName: "approval_delegation_delegate_id_staff_members_id"
	}),
	approval_delegations_delegator_id: many(approval_delegation, {
		relationName: "approval_delegation_delegator_id_staff_members_id"
	}),
	approvals: many(approvals),
	attendances: many(attendance),
	backup_restore_runs: many(backup_restore_runs),
	board_post_comments: many(board_post_comments),
	board_post_reads: many(board_post_reads),
	certificate_issuances_staff_id: many(certificate_issuances, {
		relationName: "certificate_issuances_staff_id_staff_members_id"
	}),
	certificate_issuances_issued_by: many(certificate_issuances, {
		relationName: "certificate_issuances_issued_by_staff_members_id"
	}),
	chat_messages: many(chat_messages),
	chat_push_jobs: many(chat_push_jobs),
	chat_room_prefs: many(chat_room_prefs),
	daily_closures: many(daily_closures),
	department_private_inventory_items_updated_by: many(department_private_inventory_items, {
		relationName: "department_private_inventory_items_updated_by_staff_members_id"
	}),
	department_private_inventory_items_created_by: many(department_private_inventory_items, {
		relationName: "department_private_inventory_items_created_by_staff_members_id"
	}),
	department_private_inventory_logs: many(department_private_inventory_logs),
	education_records: many(education_records),
	employment_contracts: many(employment_contracts),
	freelancer_payments: many(freelancer_payments),
	insurance_records: many(insurance_records),
	inventory_closing_snapshots: many(inventory_closing_snapshots),
	inventory_cost_entries: many(inventory_cost_entries),
	inventory_logs: many(inventory_logs),
	inventory_price_histories: many(inventory_price_history),
	inventory_receipts: many(inventory_receipts),
	leave_balances: many(leave_balances),
	leave_requests: many(leave_requests),
	license_continuing_educations_reviewed_by: many(license_continuing_education, {
		relationName: "license_continuing_education_reviewed_by_staff_members_id"
	}),
	license_continuing_educations_submitted_by: many(license_continuing_education, {
		relationName: "license_continuing_education_submitted_by_staff_members_id"
	}),
	license_continuing_educations_staff_id: many(license_continuing_education, {
		relationName: "license_continuing_education_staff_id_staff_members_id"
	}),
	meeting_bookings: many(meeting_bookings),
	message_reads: many(message_reads),
	messenger_drive_links_updated_by: many(messenger_drive_links, {
		relationName: "messenger_drive_links_updated_by_staff_members_id"
	}),
	messenger_drive_links_created_by: many(messenger_drive_links, {
		relationName: "messenger_drive_links_created_by_staff_members_id"
	}),
	notifications: many(notifications),
	op_check_templates: many(op_check_templates),
	op_patient_checks_updated_by: many(op_patient_checks, {
		relationName: "op_patient_checks_updated_by_staff_members_id"
	}),
	op_patient_checks_created_by: many(op_patient_checks, {
		relationName: "op_patient_checks_created_by_staff_members_id"
	}),
	payrolls: many(payroll),
	payroll_approval_logs: many(payroll_approval_logs),
	payroll_approval_workflows_step2_actor_id: many(payroll_approval_workflows, {
		relationName: "payroll_approval_workflows_step2_actor_id_staff_members_id"
	}),
	payroll_approval_workflows_step1_actor_id: many(payroll_approval_workflows, {
		relationName: "payroll_approval_workflows_step1_actor_id_staff_members_id"
	}),
	payroll_bonus_items_staff_id: many(payroll_bonus_items, {
		relationName: "payroll_bonus_items_staff_id_staff_members_id"
	}),
	payroll_bonus_items_created_by: many(payroll_bonus_items, {
		relationName: "payroll_bonus_items_created_by_staff_members_id"
	}),
	payroll_calendar_items_updated_by: many(payroll_calendar_items, {
		relationName: "payroll_calendar_items_updated_by_staff_members_id"
	}),
	payroll_calendar_items_created_by: many(payroll_calendar_items, {
		relationName: "payroll_calendar_items_created_by_staff_members_id"
	}),
	payroll_deduction_controls_staff_id: many(payroll_deduction_controls, {
		relationName: "payroll_deduction_controls_staff_id_staff_members_id"
	}),
	payroll_deduction_controls_created_by: many(payroll_deduction_controls, {
		relationName: "payroll_deduction_controls_created_by_staff_members_id"
	}),
	payroll_locks_reopen_reviewed_by: many(payroll_locks, {
		relationName: "payroll_locks_reopen_reviewed_by_staff_members_id"
	}),
	payroll_locks_reopen_requested_by: many(payroll_locks, {
		relationName: "payroll_locks_reopen_requested_by_staff_members_id"
	}),
	payroll_policy_versions: many(payroll_policy_versions),
	payroll_retro_adjustments_staff_id: many(payroll_retro_adjustments, {
		relationName: "payroll_retro_adjustments_staff_id_staff_members_id"
	}),
	payroll_retro_adjustments_created_by: many(payroll_retro_adjustments, {
		relationName: "payroll_retro_adjustments_created_by_staff_members_id"
	}),
	purchase_orders_received_by_id: many(purchase_orders, {
		relationName: "purchase_orders_received_by_id_staff_members_id"
	}),
	purchase_orders_inspected_by_id: many(purchase_orders, {
		relationName: "purchase_orders_inspected_by_id_staff_members_id"
	}),
	purchase_orders_expense_posted_by_id: many(purchase_orders, {
		relationName: "purchase_orders_expense_posted_by_id_staff_members_id"
	}),
	purchase_orders_created_by: many(purchase_orders, {
		relationName: "purchase_orders_created_by_staff_members_id"
	}),
	purchase_orders_closed_by_id: many(purchase_orders, {
		relationName: "purchase_orders_closed_by_id_staff_members_id"
	}),
	purchase_orders_approved_by: many(purchase_orders, {
		relationName: "purchase_orders_approved_by_staff_members_id"
	}),
	roster_approval_requests_rejected_by: many(roster_approval_requests, {
		relationName: "roster_approval_requests_rejected_by_staff_members_id"
	}),
	roster_approval_requests_approved_by: many(roster_approval_requests, {
		relationName: "roster_approval_requests_approved_by_staff_members_id"
	}),
	roster_approval_requests_requested_by: many(roster_approval_requests, {
		relationName: "roster_approval_requests_requested_by_staff_members_id"
	}),
	roster_policy_settings_updated_by: many(roster_policy_settings, {
		relationName: "roster_policy_settings_updated_by_staff_members_id"
	}),
	roster_policy_settings_created_by: many(roster_policy_settings, {
		relationName: "roster_policy_settings_created_by_staff_members_id"
	}),
	roster_swap_requests_rejected_by: many(roster_swap_requests, {
		relationName: "roster_swap_requests_rejected_by_staff_members_id"
	}),
	roster_swap_requests_approved_by: many(roster_swap_requests, {
		relationName: "roster_swap_requests_approved_by_staff_members_id"
	}),
	roster_swap_requests_staff_id: many(roster_swap_requests, {
		relationName: "roster_swap_requests_staff_id_staff_members_id"
	}),
	roster_swap_requests_requested_by: many(roster_swap_requests, {
		relationName: "roster_swap_requests_requested_by_staff_members_id"
	}),
	staff_certifications: many(staff_certifications),
	staff_evaluations_staff_id: many(staff_evaluations, {
		relationName: "staff_evaluations_staff_id_staff_members_id"
	}),
	staff_evaluations_evaluator_id: many(staff_evaluations, {
		relationName: "staff_evaluations_evaluator_id_staff_members_id"
	}),
	staff_job_categories: many(staff_job_categories),
	work_shift: one(work_shifts, {
		fields: [staff_members.shift_id],
		references: [work_shifts.id]
	}),
	company: one(companies, {
		fields: [staff_members.company_id],
		references: [companies.id]
	}),
	staff_preferred_offs: many(staff_preferred_off),
	staff_shift_assignments: many(staff_shift_assignments),
	staff_trainings: many(staff_trainings),
	staff_transfer_histories: many(staff_transfer_history),
	todo_reminder_logs: many(todo_reminder_logs),
	wiki_document_versions: many(wiki_document_versions),
	wiki_documents_updated_by: many(wiki_documents, {
		relationName: "wiki_documents_updated_by_staff_members_id"
	}),
	wiki_documents_created_by: many(wiki_documents, {
		relationName: "wiki_documents_created_by_staff_members_id"
	}),
	wiki_folders_updated_by: many(wiki_folders, {
		relationName: "wiki_folders_updated_by_staff_members_id"
	}),
	wiki_folders_created_by: many(wiki_folders, {
		relationName: "wiki_folders_created_by_staff_members_id"
	}) }));

export const approvalsRelations = relations(approvals, ({one, many}) => ({
	staff_member: one(staff_members, {
		fields: [approvals.sender_id],
		references: [staff_members.id]
	}),
	company: one(companies, {
		fields: [approvals.company_id],
		references: [companies.id]
	}),
	inventory_cost_entries: many(inventory_cost_entries),
	inventory_logs: many(inventory_logs),
	inventory_transfers: many(inventory_transfers),
	purchase_orders: many(purchase_orders),
	staff_transfer_histories: many(staff_transfer_history) }));

export const companiesRelations = relations(companies, ({one, many}) => ({
	approvals: many(approvals),
	attendances: many(attendance),
	board_posts: many(board_posts),
	company: one(companies, {
		fields: [companies.mso_id],
		references: [companies.id],
		relationName: "companies_mso_id_companies_id"
	}),
	companies: many(companies, {
		relationName: "companies_mso_id_companies_id"
	}),
	daily_closures: many(daily_closures),
	department_private_inventory_items: many(department_private_inventory_items),
	department_private_inventory_logs: many(department_private_inventory_logs),
	inventories: many(inventory),
	inventory_closing_snapshots: many(inventory_closing_snapshots),
	inventory_cost_entries: many(inventory_cost_entries),
	inventory_count_sessions: many(inventory_count_sessions),
	inventory_logs: many(inventory_logs),
	leave_requests: many(leave_requests),
	payrolls: many(payroll),
	posts: many(posts),
	roster_policy_settings: many(roster_policy_settings),
	staff_members: many(staff_members) }));

export const attendanceRelations = relations(attendance, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [attendance.staff_id],
		references: [staff_members.id]
	}),
	company: one(companies, {
		fields: [attendance.company_id],
		references: [companies.id]
	}) }));

export const backup_restore_runsRelations = relations(backup_restore_runs, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [backup_restore_runs.requested_by],
		references: [staff_members.id]
	}) }));

export const board_post_commentsRelations = relations(board_post_comments, ({one, many}) => ({
	board_post: one(board_posts, {
		fields: [board_post_comments.post_id],
		references: [board_posts.id]
	}),
	board_post_comment: one(board_post_comments, {
		fields: [board_post_comments.parent_comment_id],
		references: [board_post_comments.id],
		relationName: "board_post_comments_parent_comment_id_board_post_comments_id"
	}),
	board_post_comments: many(board_post_comments, {
		relationName: "board_post_comments_parent_comment_id_board_post_comments_id"
	}),
	staff_member: one(staff_members, {
		fields: [board_post_comments.author_id],
		references: [staff_members.id]
	}) }));

export const board_postsRelations = relations(board_posts, ({one, many}) => ({
	board_post_comments: many(board_post_comments),
	board_post_reads: many(board_post_reads),
	company: one(companies, {
		fields: [board_posts.company_id],
		references: [companies.id]
	}) }));

export const board_post_readsRelations = relations(board_post_reads, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [board_post_reads.user_id],
		references: [staff_members.id]
	}),
	board_post: one(board_posts, {
		fields: [board_post_reads.post_id],
		references: [board_posts.id]
	}) }));

export const certificate_issuancesRelations = relations(certificate_issuances, ({one}) => ({
	staff_member_staff_id: one(staff_members, {
		fields: [certificate_issuances.staff_id],
		references: [staff_members.id],
		relationName: "certificate_issuances_staff_id_staff_members_id"
	}),
	staff_member_issued_by: one(staff_members, {
		fields: [certificate_issuances.issued_by],
		references: [staff_members.id],
		relationName: "certificate_issuances_issued_by_staff_members_id"
	}) }));

export const chat_messagesRelations = relations(chat_messages, ({one, many}) => ({
	staff_member: one(staff_members, {
		fields: [chat_messages.sender_id],
		references: [staff_members.id]
	}),
	chat_room: one(chat_rooms, {
		fields: [chat_messages.room_id],
		references: [chat_rooms.id]
	}),
	message_reads: many(message_reads) }));

export const chat_roomsRelations = relations(chat_rooms, ({many}) => ({
	chat_messages: many(chat_messages),
	chat_push_jobs: many(chat_push_jobs),
	messenger_drive_links: many(messenger_drive_links),
	scheduled_messages: many(scheduled_messages) }));

export const chat_push_jobsRelations = relations(chat_push_jobs, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [chat_push_jobs.sender_id],
		references: [staff_members.id]
	}),
	chat_room: one(chat_rooms, {
		fields: [chat_push_jobs.room_id],
		references: [chat_rooms.id]
	}),
	message: one(messages, {
		fields: [chat_push_jobs.message_id],
		references: [messages.id]
	}) }));

export const messagesRelations = relations(messages, ({one, many}) => ({
	chat_push_jobs: many(chat_push_jobs),
	message_bookmarks: many(message_bookmarks),
	message: one(messages, {
		fields: [messages.reply_to_id],
		references: [messages.id],
		relationName: "messages_reply_to_id_messages_id"
	}),
	messages: many(messages, {
		relationName: "messages_reply_to_id_messages_id"
	}),
	scheduled_messages: many(scheduled_messages) }));

export const chat_room_prefsRelations = relations(chat_room_prefs, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [chat_room_prefs.user_id],
		references: [staff_members.id]
	}) }));

export const corporate_card_transactionsRelations = relations(corporate_card_transactions, ({one}) => ({
	corporate_card: one(corporate_cards, {
		fields: [corporate_card_transactions.card_id],
		references: [corporate_cards.id]
	}) }));

export const corporate_cardsRelations = relations(corporate_cards, ({many}) => ({
	corporate_card_transactions: many(corporate_card_transactions) }));

export const daily_checksRelations = relations(daily_checks, ({one}) => ({
	daily_closure: one(daily_closures, {
		fields: [daily_checks.closure_id],
		references: [daily_closures.id]
	}) }));

export const daily_closuresRelations = relations(daily_closures, ({one, many}) => ({
	daily_checks: many(daily_checks),
	daily_closure_items: many(daily_closure_items),
	staff_member: one(staff_members, {
		fields: [daily_closures.created_by],
		references: [staff_members.id]
	}),
	company: one(companies, {
		fields: [daily_closures.company_id],
		references: [companies.id]
	}) }));

export const daily_closure_itemsRelations = relations(daily_closure_items, ({one}) => ({
	daily_closure: one(daily_closures, {
		fields: [daily_closure_items.closure_id],
		references: [daily_closures.id]
	}) }));

export const department_private_inventory_itemsRelations = relations(department_private_inventory_items, ({one, many}) => ({
	staff_member_updated_by: one(staff_members, {
		fields: [department_private_inventory_items.updated_by],
		references: [staff_members.id],
		relationName: "department_private_inventory_items_updated_by_staff_members_id"
	}),
	staff_member_created_by: one(staff_members, {
		fields: [department_private_inventory_items.created_by],
		references: [staff_members.id],
		relationName: "department_private_inventory_items_created_by_staff_members_id"
	}),
	company: one(companies, {
		fields: [department_private_inventory_items.company_id],
		references: [companies.id]
	}),
	department_private_inventory_logs: many(department_private_inventory_logs) }));

export const department_private_inventory_logsRelations = relations(department_private_inventory_logs, ({one}) => ({
	department_private_inventory_item: one(department_private_inventory_items, {
		fields: [department_private_inventory_logs.item_id],
		references: [department_private_inventory_items.id]
	}),
	company: one(companies, {
		fields: [department_private_inventory_logs.company_id],
		references: [companies.id]
	}),
	staff_member: one(staff_members, {
		fields: [department_private_inventory_logs.actor_id],
		references: [staff_members.id]
	}) }));

export const device_inspectionsRelations = relations(device_inspections, ({one}) => ({
	medical_device: one(medical_devices, {
		fields: [device_inspections.device_id],
		references: [medical_devices.id]
	}) }));

export const medical_devicesRelations = relations(medical_devices, ({many}) => ({
	device_inspections: many(device_inspections) }));

export const document_versionsRelations = relations(document_versions, ({one}) => ({
	document_repository: one(document_repository, {
		fields: [document_versions.document_id],
		references: [document_repository.id]
	}) }));

export const document_repositoryRelations = relations(document_repository, ({many}) => ({
	document_versions: many(document_versions) }));

export const education_recordsRelations = relations(education_records, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [education_records.staff_id],
		references: [staff_members.id]
	}) }));

export const employment_contractsRelations = relations(employment_contracts, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [employment_contracts.staff_id],
		references: [staff_members.id]
	}) }));

export const freelancer_paymentsRelations = relations(freelancer_payments, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [freelancer_payments.created_by],
		references: [staff_members.id]
	}) }));

export const insurance_recordsRelations = relations(insurance_records, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [insurance_records.staff_id],
		references: [staff_members.id]
	}) }));

export const inventoryRelations = relations(inventory, ({one, many}) => ({
	supplier: one(suppliers, {
		fields: [inventory.supplier_id],
		references: [suppliers.id]
	}),
	company: one(companies, {
		fields: [inventory.company_id],
		references: [companies.id]
	}),
	inventory_cost_entries: many(inventory_cost_entries),
	inventory_price_histories: many(inventory_price_history),
	inventory_receipts: many(inventory_receipts) }));

export const suppliersRelations = relations(suppliers, ({many}) => ({
	inventories: many(inventory),
	inventory_cost_entries: many(inventory_cost_entries),
	inventory_price_histories: many(inventory_price_history),
	inventory_receipts: many(inventory_receipts),
	purchase_orders: many(purchase_orders) }));

export const inventory_categoriesRelations = relations(inventory_categories, ({one, many}) => ({
	inventory_category: one(inventory_categories, {
		fields: [inventory_categories.parent_id],
		references: [inventory_categories.id],
		relationName: "inventory_categories_parent_id_inventory_categories_id"
	}),
	inventory_categories: many(inventory_categories, {
		relationName: "inventory_categories_parent_id_inventory_categories_id"
	}) }));

export const inventory_closing_snapshotsRelations = relations(inventory_closing_snapshots, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [inventory_closing_snapshots.created_by_id],
		references: [staff_members.id]
	}),
	company: one(companies, {
		fields: [inventory_closing_snapshots.company_id],
		references: [companies.id]
	}) }));

export const inventory_cost_entriesRelations = relations(inventory_cost_entries, ({one}) => ({
	supplier: one(suppliers, {
		fields: [inventory_cost_entries.supplier_id],
		references: [suppliers.id]
	}),
	purchase_order: one(purchase_orders, {
		fields: [inventory_cost_entries.purchase_order_id],
		references: [purchase_orders.id]
	}),
	staff_member: one(staff_members, {
		fields: [inventory_cost_entries.posted_by_id],
		references: [staff_members.id]
	}),
	inventory: one(inventory, {
		fields: [inventory_cost_entries.inventory_item_id],
		references: [inventory.id]
	}),
	company: one(companies, {
		fields: [inventory_cost_entries.company_id],
		references: [companies.id]
	}),
	approval: one(approvals, {
		fields: [inventory_cost_entries.approval_id],
		references: [approvals.id]
	}) }));

export const purchase_ordersRelations = relations(purchase_orders, ({one, many}) => ({
	inventory_cost_entries: many(inventory_cost_entries),
	inventory_logs: many(inventory_logs),
	inventory_price_histories: many(inventory_price_history),
	inventory_transfers: many(inventory_transfers),
	supplier: one(suppliers, {
		fields: [purchase_orders.supplier_id],
		references: [suppliers.id]
	}),
	approval: one(approvals, {
		fields: [purchase_orders.source_supply_approval_id],
		references: [approvals.id]
	}),
	staff_member_received_by_id: one(staff_members, {
		fields: [purchase_orders.received_by_id],
		references: [staff_members.id],
		relationName: "purchase_orders_received_by_id_staff_members_id"
	}),
	staff_member_inspected_by_id: one(staff_members, {
		fields: [purchase_orders.inspected_by_id],
		references: [staff_members.id],
		relationName: "purchase_orders_inspected_by_id_staff_members_id"
	}),
	staff_member_expense_posted_by_id: one(staff_members, {
		fields: [purchase_orders.expense_posted_by_id],
		references: [staff_members.id],
		relationName: "purchase_orders_expense_posted_by_id_staff_members_id"
	}),
	staff_member_created_by: one(staff_members, {
		fields: [purchase_orders.created_by],
		references: [staff_members.id],
		relationName: "purchase_orders_created_by_staff_members_id"
	}),
	staff_member_closed_by_id: one(staff_members, {
		fields: [purchase_orders.closed_by_id],
		references: [staff_members.id],
		relationName: "purchase_orders_closed_by_id_staff_members_id"
	}),
	staff_member_approved_by: one(staff_members, {
		fields: [purchase_orders.approved_by],
		references: [staff_members.id],
		relationName: "purchase_orders_approved_by_staff_members_id"
	}) }));

export const inventory_count_sessionsRelations = relations(inventory_count_sessions, ({one}) => ({
	company: one(companies, {
		fields: [inventory_count_sessions.company_id],
		references: [companies.id]
	}) }));

export const inventory_logsRelations = relations(inventory_logs, ({one}) => ({
	purchase_order: one(purchase_orders, {
		fields: [inventory_logs.purchase_order_id],
		references: [purchase_orders.id]
	}),
	company: one(companies, {
		fields: [inventory_logs.company_id],
		references: [companies.id]
	}),
	approval: one(approvals, {
		fields: [inventory_logs.approval_id],
		references: [approvals.id]
	}),
	staff_member: one(staff_members, {
		fields: [inventory_logs.actor_id],
		references: [staff_members.id]
	}) }));

export const inventory_price_historyRelations = relations(inventory_price_history, ({one}) => ({
	supplier: one(suppliers, {
		fields: [inventory_price_history.supplier_id],
		references: [suppliers.id]
	}),
	staff_member: one(staff_members, {
		fields: [inventory_price_history.recorded_by],
		references: [staff_members.id]
	}),
	purchase_order: one(purchase_orders, {
		fields: [inventory_price_history.purchase_order_id],
		references: [purchase_orders.id]
	}),
	inventory: one(inventory, {
		fields: [inventory_price_history.inventory_item_id],
		references: [inventory.id]
	}) }));

export const inventory_receiptsRelations = relations(inventory_receipts, ({one}) => ({
	supplier: one(suppliers, {
		fields: [inventory_receipts.supplier_id],
		references: [suppliers.id]
	}),
	inventory: one(inventory, {
		fields: [inventory_receipts.item_id],
		references: [inventory.id]
	}),
	staff_member: one(staff_members, {
		fields: [inventory_receipts.created_by],
		references: [staff_members.id]
	}) }));

export const inventory_transfersRelations = relations(inventory_transfers, ({one}) => ({
	purchase_order: one(purchase_orders, {
		fields: [inventory_transfers.purchase_order_id],
		references: [purchase_orders.id]
	}),
	approval: one(approvals, {
		fields: [inventory_transfers.approval_id],
		references: [approvals.id]
	}) }));

export const job_category_required_trainingsRelations = relations(job_category_required_trainings, ({one}) => ({
	job_category: one(job_categories, {
		fields: [job_category_required_trainings.job_category_id],
		references: [job_categories.id]
	}) }));

export const job_categoriesRelations = relations(job_categories, ({many}) => ({
	job_category_required_trainings: many(job_category_required_trainings),
	staff_job_categories: many(staff_job_categories) }));

export const leave_balancesRelations = relations(leave_balances, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [leave_balances.staff_id],
		references: [staff_members.id]
	}) }));

export const leave_requestsRelations = relations(leave_requests, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [leave_requests.staff_id],
		references: [staff_members.id]
	}),
	company: one(companies, {
		fields: [leave_requests.company_id],
		references: [companies.id]
	}) }));

export const license_continuing_educationRelations = relations(license_continuing_education, ({one}) => ({
	staff_member_reviewed_by: one(staff_members, {
		fields: [license_continuing_education.reviewed_by],
		references: [staff_members.id],
		relationName: "license_continuing_education_reviewed_by_staff_members_id"
	}),
	staff_member_submitted_by: one(staff_members, {
		fields: [license_continuing_education.submitted_by],
		references: [staff_members.id],
		relationName: "license_continuing_education_submitted_by_staff_members_id"
	}),
	staff_license: one(staff_licenses, {
		fields: [license_continuing_education.license_id],
		references: [staff_licenses.id]
	}),
	staff_member_staff_id: one(staff_members, {
		fields: [license_continuing_education.staff_id],
		references: [staff_members.id],
		relationName: "license_continuing_education_staff_id_staff_members_id"
	}) }));

export const staff_licensesRelations = relations(staff_licenses, ({many}) => ({
	license_continuing_educations: many(license_continuing_education) }));

export const meeting_bookingsRelations = relations(meeting_bookings, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [meeting_bookings.booker_id],
		references: [staff_members.id]
	}) }));

export const message_bookmarksRelations = relations(message_bookmarks, ({one}) => ({
	message: one(messages, {
		fields: [message_bookmarks.message_id],
		references: [messages.id]
	}) }));

export const message_readsRelations = relations(message_reads, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [message_reads.reader_id],
		references: [staff_members.id]
	}),
	chat_message: one(chat_messages, {
		fields: [message_reads.message_id],
		references: [chat_messages.id]
	}) }));

export const messenger_drive_linksRelations = relations(messenger_drive_links, ({one}) => ({
	staff_member_updated_by: one(staff_members, {
		fields: [messenger_drive_links.updated_by],
		references: [staff_members.id],
		relationName: "messenger_drive_links_updated_by_staff_members_id"
	}),
	chat_room: one(chat_rooms, {
		fields: [messenger_drive_links.room_id],
		references: [chat_rooms.id]
	}),
	staff_member_created_by: one(staff_members, {
		fields: [messenger_drive_links.created_by],
		references: [staff_members.id],
		relationName: "messenger_drive_links_created_by_staff_members_id"
	}) }));

export const notificationsRelations = relations(notifications, ({one, many}) => ({
	staff_member: one(staff_members, {
		fields: [notifications.user_id],
		references: [staff_members.id]
	}),
	todo_reminder_logs: many(todo_reminder_logs) }));

export const op_check_templatesRelations = relations(op_check_templates, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [op_check_templates.created_by],
		references: [staff_members.id]
	}) }));

export const op_patient_checksRelations = relations(op_patient_checks, ({one}) => ({
	staff_member_updated_by: one(staff_members, {
		fields: [op_patient_checks.updated_by],
		references: [staff_members.id],
		relationName: "op_patient_checks_updated_by_staff_members_id"
	}),
	staff_member_created_by: one(staff_members, {
		fields: [op_patient_checks.created_by],
		references: [staff_members.id],
		relationName: "op_patient_checks_created_by_staff_members_id"
	}) }));

export const payrollRelations = relations(payroll, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [payroll.staff_id],
		references: [staff_members.id]
	}),
	company: one(companies, {
		fields: [payroll.company_id],
		references: [companies.id]
	}) }));

export const payroll_approval_logsRelations = relations(payroll_approval_logs, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [payroll_approval_logs.actor_id],
		references: [staff_members.id]
	}) }));

export const payroll_approval_workflowsRelations = relations(payroll_approval_workflows, ({one}) => ({
	staff_member_step2_actor_id: one(staff_members, {
		fields: [payroll_approval_workflows.step2_actor_id],
		references: [staff_members.id],
		relationName: "payroll_approval_workflows_step2_actor_id_staff_members_id"
	}),
	staff_member_step1_actor_id: one(staff_members, {
		fields: [payroll_approval_workflows.step1_actor_id],
		references: [staff_members.id],
		relationName: "payroll_approval_workflows_step1_actor_id_staff_members_id"
	}) }));

export const payroll_bonus_itemsRelations = relations(payroll_bonus_items, ({one}) => ({
	staff_member_staff_id: one(staff_members, {
		fields: [payroll_bonus_items.staff_id],
		references: [staff_members.id],
		relationName: "payroll_bonus_items_staff_id_staff_members_id"
	}),
	staff_member_created_by: one(staff_members, {
		fields: [payroll_bonus_items.created_by],
		references: [staff_members.id],
		relationName: "payroll_bonus_items_created_by_staff_members_id"
	}) }));

export const payroll_calendar_itemsRelations = relations(payroll_calendar_items, ({one}) => ({
	staff_member_updated_by: one(staff_members, {
		fields: [payroll_calendar_items.updated_by],
		references: [staff_members.id],
		relationName: "payroll_calendar_items_updated_by_staff_members_id"
	}),
	staff_member_created_by: one(staff_members, {
		fields: [payroll_calendar_items.created_by],
		references: [staff_members.id],
		relationName: "payroll_calendar_items_created_by_staff_members_id"
	}) }));

export const payroll_deduction_controlsRelations = relations(payroll_deduction_controls, ({one}) => ({
	staff_member_staff_id: one(staff_members, {
		fields: [payroll_deduction_controls.staff_id],
		references: [staff_members.id],
		relationName: "payroll_deduction_controls_staff_id_staff_members_id"
	}),
	staff_member_created_by: one(staff_members, {
		fields: [payroll_deduction_controls.created_by],
		references: [staff_members.id],
		relationName: "payroll_deduction_controls_created_by_staff_members_id"
	}) }));

export const payroll_locksRelations = relations(payroll_locks, ({one}) => ({
	staff_member_reopen_reviewed_by: one(staff_members, {
		fields: [payroll_locks.reopen_reviewed_by],
		references: [staff_members.id],
		relationName: "payroll_locks_reopen_reviewed_by_staff_members_id"
	}),
	staff_member_reopen_requested_by: one(staff_members, {
		fields: [payroll_locks.reopen_requested_by],
		references: [staff_members.id],
		relationName: "payroll_locks_reopen_requested_by_staff_members_id"
	}) }));

export const payroll_policy_versionsRelations = relations(payroll_policy_versions, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [payroll_policy_versions.created_by],
		references: [staff_members.id]
	}) }));

export const payroll_retro_adjustmentsRelations = relations(payroll_retro_adjustments, ({one}) => ({
	staff_member_staff_id: one(staff_members, {
		fields: [payroll_retro_adjustments.staff_id],
		references: [staff_members.id],
		relationName: "payroll_retro_adjustments_staff_id_staff_members_id"
	}),
	staff_member_created_by: one(staff_members, {
		fields: [payroll_retro_adjustments.created_by],
		references: [staff_members.id],
		relationName: "payroll_retro_adjustments_created_by_staff_members_id"
	}) }));

export const poll_votesRelations = relations(poll_votes, ({one}) => ({
	poll: one(polls, {
		fields: [poll_votes.poll_id],
		references: [polls.id]
	}) }));

export const pollsRelations = relations(polls, ({many}) => ({
	poll_votes: many(poll_votes) }));

export const postsRelations = relations(posts, ({one}) => ({
	company: one(companies, {
		fields: [posts.company_id],
		references: [companies.id]
	}) }));

export const roster_approval_requestsRelations = relations(roster_approval_requests, ({one}) => ({
	staff_member_rejected_by: one(staff_members, {
		fields: [roster_approval_requests.rejected_by],
		references: [staff_members.id],
		relationName: "roster_approval_requests_rejected_by_staff_members_id"
	}),
	staff_member_approved_by: one(staff_members, {
		fields: [roster_approval_requests.approved_by],
		references: [staff_members.id],
		relationName: "roster_approval_requests_approved_by_staff_members_id"
	}),
	staff_member_requested_by: one(staff_members, {
		fields: [roster_approval_requests.requested_by],
		references: [staff_members.id],
		relationName: "roster_approval_requests_requested_by_staff_members_id"
	}) }));

export const roster_policy_settingsRelations = relations(roster_policy_settings, ({one}) => ({
	staff_member_updated_by: one(staff_members, {
		fields: [roster_policy_settings.updated_by],
		references: [staff_members.id],
		relationName: "roster_policy_settings_updated_by_staff_members_id"
	}),
	staff_member_created_by: one(staff_members, {
		fields: [roster_policy_settings.created_by],
		references: [staff_members.id],
		relationName: "roster_policy_settings_created_by_staff_members_id"
	}),
	company: one(companies, {
		fields: [roster_policy_settings.company_id],
		references: [companies.id]
	}) }));

export const roster_swap_requestsRelations = relations(roster_swap_requests, ({one}) => ({
	staff_member_rejected_by: one(staff_members, {
		fields: [roster_swap_requests.rejected_by],
		references: [staff_members.id],
		relationName: "roster_swap_requests_rejected_by_staff_members_id"
	}),
	staff_member_approved_by: one(staff_members, {
		fields: [roster_swap_requests.approved_by],
		references: [staff_members.id],
		relationName: "roster_swap_requests_approved_by_staff_members_id"
	}),
	work_shift: one(work_shifts, {
		fields: [roster_swap_requests.current_shift_id],
		references: [work_shifts.id]
	}),
	staff_member_staff_id: one(staff_members, {
		fields: [roster_swap_requests.staff_id],
		references: [staff_members.id],
		relationName: "roster_swap_requests_staff_id_staff_members_id"
	}),
	staff_member_requested_by: one(staff_members, {
		fields: [roster_swap_requests.requested_by],
		references: [staff_members.id],
		relationName: "roster_swap_requests_requested_by_staff_members_id"
	}) }));

export const work_shiftsRelations = relations(work_shifts, ({many}) => ({
	roster_swap_requests: many(roster_swap_requests),
	staff_members: many(staff_members),
	staff_shift_assignments: many(staff_shift_assignments) }));

export const scheduled_messagesRelations = relations(scheduled_messages, ({one}) => ({
	chat_room: one(chat_rooms, {
		fields: [scheduled_messages.room_id],
		references: [chat_rooms.id]
	}),
	message: one(messages, {
		fields: [scheduled_messages.reply_to_id],
		references: [messages.id]
	}) }));

export const staff_certificationsRelations = relations(staff_certifications, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [staff_certifications.staff_id],
		references: [staff_members.id]
	}) }));

export const staff_evaluationsRelations = relations(staff_evaluations, ({one}) => ({
	staff_member_staff_id: one(staff_members, {
		fields: [staff_evaluations.staff_id],
		references: [staff_members.id],
		relationName: "staff_evaluations_staff_id_staff_members_id"
	}),
	staff_member_evaluator_id: one(staff_members, {
		fields: [staff_evaluations.evaluator_id],
		references: [staff_members.id],
		relationName: "staff_evaluations_evaluator_id_staff_members_id"
	}) }));

export const staff_job_categoriesRelations = relations(staff_job_categories, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [staff_job_categories.staff_id],
		references: [staff_members.id]
	}),
	job_category: one(job_categories, {
		fields: [staff_job_categories.job_category_id],
		references: [job_categories.id]
	}) }));

export const staff_preferred_offRelations = relations(staff_preferred_off, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [staff_preferred_off.staff_id],
		references: [staff_members.id]
	}) }));

export const staff_shift_assignmentsRelations = relations(staff_shift_assignments, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [staff_shift_assignments.staff_id],
		references: [staff_members.id]
	}),
	work_shift: one(work_shifts, {
		fields: [staff_shift_assignments.shift_id],
		references: [work_shifts.id]
	}) }));

export const staff_trainingsRelations = relations(staff_trainings, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [staff_trainings.staff_id],
		references: [staff_members.id]
	}) }));

export const staff_transfer_historyRelations = relations(staff_transfer_history, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [staff_transfer_history.staff_id],
		references: [staff_members.id]
	}),
	approval: one(approvals, {
		fields: [staff_transfer_history.approval_id],
		references: [approvals.id]
	}) }));

export const todo_reminder_logsRelations = relations(todo_reminder_logs, ({one}) => ({
	staff_member: one(staff_members, {
		fields: [todo_reminder_logs.user_id],
		references: [staff_members.id]
	}),
	notification: one(notifications, {
		fields: [todo_reminder_logs.notification_id],
		references: [notifications.id]
	}) }));

export const wiki_document_versionsRelations = relations(wiki_document_versions, ({one, many}) => ({
	wiki_document_version: one(wiki_document_versions, {
		fields: [wiki_document_versions.restore_of_version_id],
		references: [wiki_document_versions.id],
		relationName: "wiki_document_versions_restore_of_version_id_wiki_document_versions_id"
	}),
	wiki_document_versions: many(wiki_document_versions, {
		relationName: "wiki_document_versions_restore_of_version_id_wiki_document_versions_id"
	}),
	wiki_document: one(wiki_documents, {
		fields: [wiki_document_versions.document_id],
		references: [wiki_documents.id]
	}),
	staff_member: one(staff_members, {
		fields: [wiki_document_versions.created_by],
		references: [staff_members.id]
	}) }));

export const wiki_documentsRelations = relations(wiki_documents, ({one, many}) => ({
	wiki_document_versions: many(wiki_document_versions),
	staff_member_updated_by: one(staff_members, {
		fields: [wiki_documents.updated_by],
		references: [staff_members.id],
		relationName: "wiki_documents_updated_by_staff_members_id"
	}),
	wiki_folder: one(wiki_folders, {
		fields: [wiki_documents.folder_id],
		references: [wiki_folders.id]
	}),
	staff_member_created_by: one(staff_members, {
		fields: [wiki_documents.created_by],
		references: [staff_members.id],
		relationName: "wiki_documents_created_by_staff_members_id"
	}) }));

export const wiki_foldersRelations = relations(wiki_folders, ({one, many}) => ({
	wiki_documents: many(wiki_documents),
	staff_member_updated_by: one(staff_members, {
		fields: [wiki_folders.updated_by],
		references: [staff_members.id],
		relationName: "wiki_folders_updated_by_staff_members_id"
	}),
	staff_member_created_by: one(staff_members, {
		fields: [wiki_folders.created_by],
		references: [staff_members.id],
		relationName: "wiki_folders_created_by_staff_members_id"
	}) }));