import { sqliteTable, AnySQLiteColumn, index, text, integer, real, foreignKey, uniqueIndex, numeric } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const access_logs = sqliteTable("access_logs", {
	id: text().primaryKey().notNull(),
	user_id: text(),
	user_name: text(),
	company: text(),
	menu: text(),
	action: text(),
	ip_address: text(),
	user_agent: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_access_logs_user_created_at").on(table.user_id, table.created_at),
	index("idx_access_logs_created_at").on(table.created_at),
	index("idx_access_logs_company_menu_created_at").on(table.company, table.menu, table.created_at),
]);

export const annual_leave_promotion_logs = sqliteTable("annual_leave_promotion_logs", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	company_name: text(),
	target_year: integer().notNull(),
	step: integer().notNull(),
	sent_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	remain_days: real(),
	meta: text(),
	stage: integer(),
	expiry_date: text(),
	notified_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	plan_submitted_at: text(),
	remaining_days_at_notice: real(),
	notification_id: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_annual_leave_promotion_logs_staff_year").on(table.staff_id, table.target_year, table.step),
	index("idx_alpl_stage").on(table.stage),
	index("idx_alpl_staff_id").on(table.staff_id),
	index("idx_alpl_expiry_date").on(table.expiry_date),
]);

export const approval_delegation = sqliteTable("approval_delegation", {
	id: text().primaryKey().notNull(),
	delegator_id: text().references(() => staff_members.id),
	delegate_id: text().references(() => staff_members.id),
	start_date: text(),
	end_date: text(),
	is_active: integer().default(1),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const approval_form_types = sqliteTable("approval_form_types", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	description: text(),
	sort_order: integer().default(0),
	is_active: integer().default(1),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_approval_form_types_active").on(table.is_active),
]);

export const approval_history = sqliteTable("approval_history", {
	id: text().primaryKey().notNull(),
	approval_id: text().notNull(),
	approver_id: text(),
	approver_name: text(),
	action: text().notNull(),
	comment: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_approval_history_approval").on(table.approval_id),
]);

export const approval_templates = sqliteTable("approval_templates", {
	id: text().primaryKey().notNull(),
	form_type: text().notNull(),
	default_values: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const approvals = sqliteTable("approvals", {
	id: text().primaryKey().notNull(),
	company_id: text().references(() => companies.id),
	sender_id: text().references(() => staff_members.id),
	sender_name: text(),
	sender_company: text(),
	type: text(),
	title: text().notNull(),
	content: text(),
	status: text().default("대기"),
	current_approver_id: text(),
	meta_data: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text(),
	sender_department: text(),
	approver_line: text(),
	doc_number: text(),
	approval_line: text(),
	name: text(),
	doc_type: text(),
},
(table) => [
	index("idx_approvals_doc_number").on(table.doc_number),
	index("idx_approvals_company_id_status_created_at").on(table.company_id, table.status, table.created_at),
]);

export const asset_loan_item_settings = sqliteTable("asset_loan_item_settings", {
	company_name: text().primaryKey(),
	items: text().default("[]").notNull(),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const asset_loans = sqliteTable("asset_loans", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	asset_type: text().notNull(),
	asset_name: text(),
	loaned_at: text().notNull(),
	returned_at: text(),
	condition_notes: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_asset_staff").on(table.staff_id),
]);

export const attendance = sqliteTable("attendance", {
	id: text().primaryKey().notNull(),
	staff_id: text().references(() => staff_members.id, { onDelete: "cascade" } ),
	date: text().notNull(),
	check_in: text(),
	check_out: text(),
	status: text().default("정상"),
	notes: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	company_id: text().references(() => companies.id),
},
(table) => [
	uniqueIndex("idx_attendance_staff_date_unique").on(table.staff_id, table.date),
	index("idx_attendance_staff_date").on(table.staff_id, table.date),
	index("idx_attendance_company_id").on(table.company_id),
]);

export const attendance_corrections = sqliteTable("attendance_corrections", {
	id: text().primaryKey().notNull(),
	staff_id: text(),
	original_date: text(),
	correction_type: text(),
	reason: text(),
	status: text().default("대기"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	attendance_date: text(),
	requested_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	// 비유니크 — 동일 (staff_id, attendance_date)에 정정 신청이 여러 건 존재할 수 있다.
	index("idx_attendance_corrections_staff_date").on(table.staff_id, table.attendance_date),
]);

export const attendance_deduction_rules = sqliteTable("attendance_deduction_rules", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체"),
	late_deduction_type: text().default("fixed"),
	late_deduction_amount: integer().default(10000),
	early_leave_deduction_type: text().default("fixed"),
	early_leave_deduction_amount: integer().default(10000),
	absent_use_daily_rate: integer().default(1),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const attendances = sqliteTable("attendances", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	company_id: text(),
	company_name: text(),
	work_date: text().notNull(),
	check_in_time: text(),
	check_out_time: text(),
	status: text().default("present"),
	work_hours_minutes: integer(),
	notes: text(),
	current_status: text(),
	current_status_at: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	uniqueIndex("idx_attendances_staff_date_unique").on(table.staff_id, table.work_date),
	index("idx_attendances_work_date").on(table.work_date),
	index("idx_attendances_staff_date").on(table.staff_id, table.work_date),
]);

export const audit_logs = sqliteTable("audit_logs", {
	id: text().primaryKey().notNull(),
	user_id: text(),
	user_name: text(),
	action: text().notNull(),
	target_type: text(),
	target_id: text(),
	details: text(),
	ip_address: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	actor_name: text(),
},
(table) => [
	index("idx_audit_logs_created").on(table.created_at),
]);

export const backup_restore_runs = sqliteTable("backup_restore_runs", {
	id: text().primaryKey().notNull(),
	file_name: text().notNull(),
	meta: text().default("{}"),
	preview: text().default("[]"),
	result_summary: text().default("{}"),
	log_lines: text().default("{}"),
	total_tables: integer().default(0),
	total_rows: integer().default(0),
	status: text().default("running"),
	requested_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	requested_by_name: text(),
	started_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	finished_at: text(),
},
(table) => [
	index("idx_backup_restore_runs_started").on(table.started_at),
]);

export const board_post_comments = sqliteTable("board_post_comments", {
	id: text().primaryKey().notNull(),
	post_id: text().references(() => board_posts.id, { onDelete: "cascade" } ),
	author_id: text().references(() => staff_members.id),
	author_name: text(),
	content: text().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	parent_comment_id: text(),
	is_anonymous: integer().default(0),
},
(table) => [
	index("idx_board_post_comments_parent_comment_id").on(table.parent_comment_id),
	foreignKey(() => ({
			columns: [table.parent_comment_id],
			foreignColumns: [table.id],
			name: "board_post_comments_parent_comment_id_board_post_comments_id_fk"
		})).onDelete("cascade"),
]);

export const board_post_likes = sqliteTable("board_post_likes", {
	id: text().primaryKey().notNull(),
	post_id: text(),
	user_id: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_board_post_likes_user_id").on(table.user_id),
]);

export const board_post_reads = sqliteTable("board_post_reads", {
	id: text().primaryKey().notNull(),
	post_id: text().notNull().references(() => board_posts.id, { onDelete: "cascade" } ),
	user_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	read_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_board_post_reads_user_id").on(table.user_id),
	index("idx_board_post_reads_post_id").on(table.post_id),
]);

export const board_posts = sqliteTable("board_posts", {
	id: text().primaryKey().notNull(),
	company_id: text().references(() => companies.id),
	board_type: text(),
	title: text().notNull(),
	content: text(),
	author_id: text(),
	author_name: text(),
	company: text(),
	views: integer().default(0),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	is_anonymous: integer().default(0),
	poll: text(),
	poll_votes: text().default("{}"),
	likes_count: integer().default(0),
	status: text(),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	board_id: text(),
	tags: text().default("[]"),
	attachments: text().default("[]"),
	is_pinned: integer().default(0),
	scheduled_publish_at: text(),
	schedule_date: text(),
	schedule_time: text(),
	schedule_room: text(),
	patient_name: text(),
	surgery_fasting: integer().default(0),
	surgery_inpatient: integer().default(0),
	surgery_guardian: integer().default(0),
	surgery_caregiver: integer().default(0),
	surgery_transfusion: integer().default(0),
	mri_contrast_required: integer().default(0),
},
(table) => [
	index("idx_board_posts_schedule_date").on(table.schedule_date),
	index("idx_board_posts_company_id_board_type_created_at").on(table.company_id, table.board_type, table.created_at),
	index("idx_board_posts_company_id").on(table.company_id),
	index("idx_board_posts_board_type_created_desc").on(table.board_type, table.created_at),
	index("idx_board_posts_board_id_created_at").on(table.board_id, table.created_at),
]);

export const certificate_issuances = sqliteTable("certificate_issuances", {
	id: text().primaryKey().notNull(),
	staff_id: text().references(() => staff_members.id, { onDelete: "cascade" } ),
	cert_type: text().notNull(),
	serial_no: text(),
	purpose: text(),
	issued_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	issued_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const chat_messages = sqliteTable("chat_messages", {
	id: text().primaryKey().notNull(),
	room_id: text().references(() => chat_rooms.id, { onDelete: "cascade" } ),
	sender_id: text().references(() => staff_members.id),
	content: text().notNull(),
	type: text().default("text"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const chat_push_jobs = sqliteTable("chat_push_jobs", {
	id: text().primaryKey().notNull(),
	message_id: text().notNull().references(() => messages.id, { onDelete: "cascade" } ),
	room_id: text().notNull().references(() => chat_rooms.id, { onDelete: "cascade" } ),
	sender_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	processing_started_at: text(),
	processed_at: text(),
	attempt_count: integer().default(0),
	last_error: text(),
	next_attempt_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	dead_lettered_at: text(),
},
(table) => [
	index("idx_chat_push_jobs_ready").on(table.next_attempt_at, table.created_at),
	index("idx_chat_push_jobs_processing_started_at").on(table.processing_started_at),
	index("idx_chat_push_jobs_pending").on(table.processed_at, table.created_at),
	uniqueIndex("idx_chat_push_jobs_message_id").on(table.message_id),
]);

export const chat_room_favorites = sqliteTable("chat_room_favorites", {
	id: text().primaryKey().notNull(),
	user_id: text().notNull(),
	room_id: text().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const chat_room_prefs = sqliteTable("chat_room_prefs", {
	id: text().primaryKey().notNull(),
	user_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	room_id: text().notNull(),
	pinned: integer().default(0),
	hidden: integer().default(0),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_chat_room_prefs_user_id").on(table.user_id),
	index("idx_chat_room_prefs_room_id").on(table.room_id),
]);

export const chat_rooms = sqliteTable("chat_rooms", {
	id: text().primaryKey().notNull(),
	name: text(),
	type: text(),
	members: text(),
	is_announcement: integer().default(0),
	created_by: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	last_message_at: text(),
	last_message: text(),
	last_message_preview: text(),
	member_ids: text().default("{}"),
},
(table) => [
	index("idx_chat_rooms_last_message_at_desc").on(table.last_message_at, table.created_at),
]);

export const chat_typing_status = sqliteTable("chat_typing_status", {
	room_id: text().notNull(),
	user_id: text().notNull(),
	user_name: text().notNull().default(''),
	updated_at: text().notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
},
(table) => [
	index("idx_chat_typing_status_room_updated").on(table.room_id, table.updated_at),
]);

export const companies = sqliteTable("companies", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	type: text().notNull(),
	mso_id: text(),
	is_active: integer().default(1),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	ceo_name: text(),
	business_no: text(),
	address: text(),
	phone: text(),
	memo: text(),
	payment_day: integer().default(7),
	business_number: text(),
	seal_url: text(),
	leave_policy: text().default("입사일"),
	unused_leave_compensation: integer().default(0),
	fiscal_year_start_month: integer().default(1),
},
(table) => [
	foreignKey(() => ({
			columns: [table.mso_id],
			foreignColumns: [table.id],
			name: "companies_mso_id_companies_id_fk"
		})),
]);

export const company_expenses = sqliteTable("company_expenses", {
	id: text().primaryKey().notNull(),
	company: text().notNull(),
	year_month: text().notNull(),
	rent: real(),
	materials: real(),
	utilities: real(),
	others: real(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	uniqueIndex("idx_company_expenses_company_month").on(table.company, table.year_month),
]);

export const company_holidays = sqliteTable("company_holidays", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체"),
	holiday_date: text().notNull(),
	name: text().notNull(),
	note: text(),
	created_by: text(),
	created_by_name: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_company_holidays_scope_date").on(table.company_name, table.holiday_date),
]);

export const company_seals = sqliteTable("company_seals", {
	id: text().primaryKey().notNull(),
	company: text().notNull(),
	type: text().default("대표인").notNull(),
	image_url: text().notNull(),
	is_active: integer().default(1).notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const contract_templates = sqliteTable("contract_templates", {
	id: text().primaryKey().notNull(),
	company_name: text().notNull(),
	template_content: text(),
	seal_url: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const corporate_card_transactions = sqliteTable("corporate_card_transactions", {
	id: text().primaryKey().notNull(),
	card_holder_id: text(),
	transaction_date: text().notNull(),
	merchant: text(),
	category: text(),
	amount: integer().default(0),
	description: text(),
	receipt_url: text(),
	company_name: text().default("전체"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	card_id: text().references(() => corporate_cards.id, { onDelete: "set null" } ),
},
(table) => [
	index("idx_card_date").on(table.transaction_date),
	index("idx_card_category").on(table.category),
]);

export const corporate_cards = sqliteTable("corporate_cards", {
	id: text().primaryKey().notNull(),
	company_name: text().notNull(),
	card_nickname: text(),
	last_four: text(),
	issuer: text(),
	holder_id: text(),
	status: text().default("active"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_corporate_cards_company").on(table.company_name),
]);

export const daily_checks = sqliteTable("daily_checks", {
	id: text().primaryKey().notNull(),
	closure_id: text().references(() => daily_closures.id, { onDelete: "cascade" } ),
	check_number: text().notNull(),
	amount: integer().notNull(),
	bank_name: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const daily_closure_items = sqliteTable("daily_closure_items", {
	id: text().primaryKey().notNull(),
	closure_id: text().references(() => daily_closures.id, { onDelete: "cascade" } ),
	patient_name: text(),
	amount: integer().notNull(),
	payment_method: text(),
	receipt_type: text(),
	memo: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const daily_closures = sqliteTable("daily_closures", {
	id: text().primaryKey().notNull(),
	company_id: text().references(() => companies.id),
	date: text().notNull(),
	total_amount: integer().default(0),
	petty_cash_start: integer().default(0),
	petty_cash_end: integer().default(0),
	status: text().default("draft"),
	created_by: text().references(() => staff_members.id),
	memo: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const delivery_confirmations = sqliteTable("delivery_confirmations", {
	id: text().primaryKey().notNull(),
	doc_number: text(),
	issue_date: text(),
	supplier_name: text(),
	supplier_rep: text(),
	receiver_company: text(),
	receiver_rep: text(),
	delivery_date: text(),
	notes: text(),
	items: text().default("[]"),
	total_amount: real(),
	created_by: text(),
	created_by_id: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_delivery_confirmations_created_at").on(table.created_at),
]);

export const department_private_inventory_items = sqliteTable("department_private_inventory_items", {
	id: text().primaryKey().notNull(),
	company: text().notNull(),
	company_id: text().references(() => companies.id),
	department: text().notNull(),
	item_name: text().notNull(),
	category: text(),
	unit: text().default("EA"),
	quantity: integer().default(0),
	min_quantity: integer().default(0),
	total_used: integer().default(0),
	memo: text(),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_by_name: text(),
	updated_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	updated_by_name: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	uniqueIndex("department_private_inventory_unique_item").on(table.company_id, table.department, table.item_name),
	index("department_private_inventory_scope_idx").on(table.company_id, table.department, table.item_name),
]);

export const department_private_inventory_logs = sqliteTable("department_private_inventory_logs", {
	id: text().primaryKey().notNull(),
	item_id: text().notNull().references(() => department_private_inventory_items.id, { onDelete: "cascade" } ),
	company: text().notNull(),
	company_id: text().references(() => companies.id),
	department: text().notNull(),
	item_name: text().notNull(),
	action: text().default("consume"),
	quantity: integer().default(0),
	prev_quantity: integer(),
	next_quantity: integer(),
	actor_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	actor_name: text(),
	notes: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("department_private_inventory_logs_scope_idx").on(table.company_id, table.department, table.created_at),
	index("department_private_inventory_logs_item_idx").on(table.item_id, table.created_at),
]);

export const device_inspections = sqliteTable("device_inspections", {
	id: text().primaryKey().notNull(),
	device_id: text().references(() => medical_devices.id, { onDelete: "cascade" } ),
	device_name: text(),
	inspected_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	inspector: text(),
	result: text(),
	notes: text(),
	next_inspection_date: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const discharge_reviews = sqliteTable("discharge_reviews", {
	id: text().primaryKey().notNull(),
	patient_name: text().notNull(),
	department: text().notNull(),
	admission_date: text().notNull(),
	discharge_date: text().notNull(),
	diagnosis: text().default(""),
	items: text().default("[]"),
	status: text().default("pending"),
	reviewer_name: text().notNull(),
	reviewer_id: text().notNull(),
	ai_analysis: text().default(""),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	chart_data: text().default(""),
	template_id: text().default(""),
	birth_date: text().default(""),
	gender: text().default(""),
	insurance_type: text().default(""),
	surgery_name: text().default(""),
	surgery_date: text().default(""),
	room_grade: text().default(""),
	doctor_name: text().default(""),
	comorbidities: text().default(""),
	admission_route: text().default(""),
	discharge_type: text().default(""),
	drg_code: text().default(""),
	disease_codes: text().default(""),
});

export const discharge_templates = sqliteTable("discharge_templates", {
	id: text().default("default").primaryKey(),
	items: text().default("[]"),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	title: text().default(""),
});

export const document_repository = sqliteTable("document_repository", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	category: text().notNull(),
	content: text(),
	file_url: text(),
	version: integer().default(1),
	company_name: text().default("전체"),
	created_by: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_document_repo_company").on(table.company_name),
	index("idx_document_repo_category").on(table.category),
]);

export const document_versions = sqliteTable("document_versions", {
	id: text().primaryKey().notNull(),
	document_id: text().notNull().references(() => document_repository.id, { onDelete: "cascade" } ),
	version: integer().notNull(),
	content: text(),
	file_url: text(),
	created_by: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_document_versions_doc").on(table.document_id),
]);

export const education_records = sqliteTable("education_records", {
	id: text().primaryKey().notNull(),
	staff_id: text().references(() => staff_members.id, { onDelete: "cascade" } ),
	education_name: text().notNull(),
	deadline: text(),
	completed_at: text(),
	status: text().default("대기"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const employment_contracts = sqliteTable("employment_contracts", {
	id: text().primaryKey().notNull(),
	staff_id: text().references(() => staff_members.id, { onDelete: "cascade" } ),
	contract_type: text(),
	status: text().default("서명대기"),
	base_salary: integer().default(0),
	meal_allowance: integer().default(0),
	vehicle_allowance: integer().default(0),
	childcare_allowance: integer().default(0),
	position_allowance: integer().default(0),
	research_allowance: integer().default(0),
	other_taxfree: integer().default(0),
	effective_date: text(),
	probation_months: integer().default(3),
	probation_percent: integer().default(90),
	payment_day: integer().default(7),
	content: text(),
	working_hours_per_week: real().default(40),
	working_days_per_week: integer().default(5),
	shift_start_time: text().default("09:00:00"),
	shift_end_time: text().default("18:00:00"),
	break_start_time: text().default("12:00:00"),
	break_end_time: text().default("13:00:00"),
	signature_data: text(),
	requested_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	signed_at: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	start_date: text(),
},
(table) => [
	index("idx_contracts_staff_id").on(table.staff_id),
]);

export const freelancer_payments = sqliteTable("freelancer_payments", {
	id: text().primaryKey().notNull(),
	company_name: text().notNull(),
	year_month: text().notNull(),
	vendor_name: text().notNull(),
	work_type: text(),
	payment_date: text().notNull(),
	supply_amount: integer().default(0),
	tax_rate: real().default(3.3),
	withholding_tax: integer().default(0),
	note: text(),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_freelancer_payments_company_month").on(table.company_name, table.year_month, table.payment_date),
]);

export const generated_reports = sqliteTable("generated_reports", {
	id: text().primaryKey().notNull(),
	schedule_id: text(),
	report_type: text().notNull(),
	period: text().notNull(),
	status: text().default("completed"),
	summary: text().default("{}"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_generated_reports_type_period").on(table.report_type, table.period),
	index("idx_generated_reports_schedule_created").on(table.schedule_id, table.created_at),
]);

export const handover_notes = sqliteTable("handover_notes", {
	id: text().primaryKey().notNull(),
	content: text().notNull(),
	author_id: text().notNull(),
	author_name: text().notNull(),
	shift: text().notNull(),
	priority: text().default("Normal"),
	is_completed: integer().default(0),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const health_checkups = sqliteTable("health_checkups", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	staff_name: text(),
	company: text(),
	department: text(),
	checkup_type: text(),
	scheduled_date: text(),
	completed_date: text(),
	status: text().default("예정"),
	hospital: text(),
	result: text(),
	memo: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const incident_reports = sqliteTable("incident_reports", {
	id: text().primaryKey().notNull(),
	incident_date: text(),
	incident_time: text(),
	location: text(),
	type: text(),
	severity: text(),
	description: text(),
	involved_persons: text(),
	immediate_action: text(),
	root_cause: text(),
	preventive_measures: text(),
	reporter_id: text(),
	reporter_name: text(),
	status: text().default("보고완료"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const insurance_records = sqliteTable("insurance_records", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	staff_name: text().default("").notNull(),
	company: text().default("").notNull(),
	department: text().default("").notNull(),
	type: text().default("").notNull(),
	insurance_type: text().default("").notNull(),
	reason: text().default("").notNull(),
	effective_date: text().default(sql`(CURRENT_DATE)`).notNull(),
	reported_at: text(),
	status: text().default("").notNull(),
	resident_no: text(),
	memo: text().default("").notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	index("idx_insurance_records_created_at").on(table.created_at),
	index("idx_insurance_records_company_status").on(table.company, table.status),
	index("idx_insurance_records_staff").on(table.staff_id),
]);

export const inventory = sqliteTable("inventory", {
	id: text().primaryKey().notNull(),
	company_id: text().references(() => companies.id),
	company: text(),
	category: text().default("일반"),
	item_name: text().notNull(),
	quantity: integer().default(0),
	min_quantity: integer().default(5),
	unit_price: integer().default(0),
	expiry_date: text(),
	lot_number: text(),
	is_udi: integer().default(0),
	udi_code: text(),
	location: text(),
	supplier_id: text().references(() => suppliers.id, { onDelete: "set null" } ),
	last_updated: text().default(sql`(CURRENT_TIMESTAMP)`),
	stock: integer().default(0),
	supplier_name: text(),
	insurance_code: text(),
	spec: text(),
	department: text(),
	safety_stock: integer().default(0),
	supplier: text(),
	barcode: text(),
	expiration_date: text(),
	price: integer().default(0),
	serial_number: text(),
	name: text(),
	min_stock: integer().default(10),
},
(table) => [
	index("idx_inventory_lot_number").on(table.lot_number),
	index("idx_inventory_location").on(table.location),
	index("idx_inventory_company_id_item_name").on(table.company_id, table.item_name),
	index("idx_inventory_company_id").on(table.company_id),
	index("idx_inventory_company_department").on(table.company_id, table.department),
]);

export const inventory_categories = sqliteTable("inventory_categories", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	parent_id: text(),
	description: text(),
	color: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	uniqueIndex("idx_inventory_categories_parent_name").on(table.parent_id, table.name),
	index("idx_inventory_categories_parent_id").on(table.parent_id),
	foreignKey(() => ({
			columns: [table.parent_id],
			foreignColumns: [table.id],
			name: "inventory_categories_parent_id_inventory_categories_id_fk"
		})).onDelete("cascade"),
]);

export const inventory_closing_snapshots = sqliteTable("inventory_closing_snapshots", {
	id: text().primaryKey().notNull(),
	closing_month: text().notNull(),
	snapshot_date: text(),
	company: text(),
	company_id: text().references(() => companies.id, { onDelete: "set null" } ),
	status: text().default("locked"),
	item_count: integer().default(0),
	total_quantity: real(),
	total_value: real(),
	summary: text().default("{}"),
	items: text().default("[]"),
	created_by_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_by_name: text(),
	closed_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_inventory_closing_snapshots_company_month").on(table.company, table.closing_month),
]);

export const inventory_cost_entries = sqliteTable("inventory_cost_entries", {
	id: text().primaryKey().notNull(),
	purchase_order_id: text().references(() => purchase_orders.id, { onDelete: "set null" } ),
	approval_id: text().references(() => approvals.id, { onDelete: "set null" } ),
	inventory_item_id: text().references(() => inventory.id, { onDelete: "set null" } ),
	order_item_index: integer().default(0),
	item_name: text().notNull(),
	company_id: text().references(() => companies.id, { onDelete: "set null" } ),
	company_name: text(),
	department: text(),
	supplier_id: text().references(() => suppliers.id, { onDelete: "set null" } ),
	supplier_name: text(),
	qty_ordered: real(),
	qty_received: real(),
	qty_rejected: real(),
	qty_pending: real(),
	unit_price: real(),
	supply_amount: real(),
	vat_amount: real(),
	total_amount: real(),
	cost_center: text(),
	budget_item: text(),
	account_code: text(),
	posted_status: text().default("posted"),
	occurred_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	posted_at: text(),
	posted_by_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	posted_by_name: text(),
	idempotency_key: text(),
	notes: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_inventory_cost_entries_purchase_order").on(table.purchase_order_id),
	uniqueIndex("idx_inventory_cost_entries_idempotency_key").on(table.idempotency_key),
	index("idx_inventory_cost_entries_company_month").on(table.company_name, table.occurred_at),
]);

export const inventory_count_sessions = sqliteTable("inventory_count_sessions", {
	id: text().primaryKey().notNull(),
	conducted_by: text(),
	conducted_name: text(),
	total_items: integer().default(0),
	discrepancy_count: integer().default(0),
	report: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	company: text(),
	company_id: text().references(() => companies.id, { onDelete: "set null" } ),
	department: text(),
},
(table) => [
	index("idx_inventory_count_sessions_scope_created_at").on(table.company_id, table.department, table.created_at),
	index("idx_inventory_count_sessions_created_at").on(table.created_at),
]);

export const inventory_logs = sqliteTable("inventory_logs", {
	id: text().primaryKey().notNull(),
	item_id: text(),
	type: text(),
	quantity: integer(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	inventory_id: text(),
	change_type: text(),
	prev_quantity: integer(),
	next_quantity: integer(),
	actor_name: text(),
	company: text(),
	company_id: text().references(() => companies.id),
	department: text(),
	notes: text(),
	actor_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	approval_id: text().references(() => approvals.id, { onDelete: "set null" } ),
	purchase_order_id: text().references(() => purchase_orders.id, { onDelete: "set null" } ),
	serial_number: text(),
	lot_number: text(),
	expiry_date: text(),
	location: text(),
	unit_price: real(),
	supplier_name: text(),
},
(table) => [
	index("idx_inventory_logs_scope_created_at").on(table.company_id, table.department, table.created_at),
	index("idx_inventory_logs_purchase_order_id").on(table.purchase_order_id),
	index("idx_inventory_logs_lot_number").on(table.lot_number),
	index("idx_inventory_logs_company_id_created_at").on(table.company_id, table.created_at),
	index("idx_inventory_logs_company_department_created_at").on(table.company_id, table.department, table.created_at),
	index("idx_inventory_logs_approval_id").on(table.approval_id),
]);

export const inventory_price_history = sqliteTable("inventory_price_history", {
	id: text().primaryKey().notNull(),
	inventory_item_id: text().notNull().references(() => inventory.id, { onDelete: "cascade" } ),
	supplier_id: text().references(() => suppliers.id, { onDelete: "set null" } ),
	supplier_name: text(),
	unit_price: real(),
	quantity: integer().default(0),
	total_amount: real(),
	source_type: text().default("manual"),
	recorded_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	recorded_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	purchase_order_id: text().references(() => purchase_orders.id, { onDelete: "set null" } ),
	notes: text(),
},
(table) => [
	index("idx_inventory_price_history_purchase_order_id").on(table.purchase_order_id),
	index("idx_inventory_price_history_item_recorded_at").on(table.inventory_item_id, table.recorded_at),
]);

export const inventory_receipts = sqliteTable("inventory_receipts", {
	id: text().primaryKey().notNull(),
	item_id: text().references(() => inventory.id, { onDelete: "restrict" } ),
	qty: integer().notNull(),
	unit_price: real(),
	supplier_id: text().references(() => suppliers.id, { onDelete: "set null" } ),
	receipt_date: text().default(sql`(CURRENT_TIMESTAMP)`),
	receipt_type: text().default("수동"),
	lot_number: text(),
	expiry_date: text(),
	invoice_number: text(),
	notes: text(),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const inventory_transfers = sqliteTable("inventory_transfers", {
	id: text().primaryKey().notNull(),
	item_id: text(),
	item_name: text(),
	quantity: integer().default(0),
	from_company: text(),
	from_department: text(),
	to_company: text(),
	to_department: text(),
	reason: text(),
	transferred_by: text(),
	transferred_by_id: text(),
	status: text().default("완료"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	approval_id: text().references(() => approvals.id, { onDelete: "set null" } ),
	purchase_order_id: text().references(() => purchase_orders.id, { onDelete: "set null" } ),
	serial_number: text(),
},
(table) => [
	index("idx_inventory_transfers_purchase_order_id").on(table.purchase_order_id),
	index("idx_inventory_transfers_created_at").on(table.created_at),
	index("idx_inventory_transfers_approval_id").on(table.approval_id),
]);

export const job_categories = sqliteTable("job_categories", {
	id: text().primaryKey().notNull(),
	code: text().notNull(),
	name: text().notNull(),
	is_medical_staff: integer().default(1),
	display_order: integer().default(0),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const job_category_required_trainings = sqliteTable("job_category_required_trainings", {
	id: text().primaryKey().notNull(),
	job_category_id: text().references(() => job_categories.id),
	applies_to_all: integer().default(0),
	training_code: text().notNull(),
	training_name: text().notNull(),
	cycle_months: integer(),
	mandatory: integer().default(1),
	obligation_type: text().default("legal"),
	legal_basis: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_jcrt_job_category_id").on(table.job_category_id),
	index("idx_jcrt_applies_to_all").on(table.applies_to_all),
]);

export const leave_balances = sqliteTable("leave_balances", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	year: integer().notNull(),
	total_days: real(),
	used_days: real(),
	remaining_days: real(),
	expiry_date: text(),
	expired_days: real(),
	expired_at: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	compensated_days: real(),
	compensated_at: text(),
},
(table) => [
	index("idx_leave_balances_staff_id").on(table.staff_id),
	index("idx_leave_balances_expiry_date").on(table.expiry_date),
]);

// 연차 자동발생/대체휴무 부여 원장 (멱등성 + 감사)
// kind: 'monthly'(1년미만 월 만근 +1일) | 'annual'(만N년 연차 부여) | 'substitute'(공휴일근무 대체휴무)
// period_key: monthly='YYYY-MM'(근무월 시작), annual='annual:N'(N년차), substitute='YYYY-MM-DD'(근무일)
// UNIQUE(staff_id, kind, period_key) 로 동일 기간 중복 부여 차단 → 크론이 매일 돌아도 1회만 부여.
export const leave_accruals = sqliteTable("leave_accruals", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	company_id: text(),
	kind: text().notNull(),
	period_key: text().notNull(),
	days: real().notNull(),
	year: integer().notNull(),
	source_date: text(),
	note: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	uniqueIndex("idx_leave_accruals_unique").on(table.staff_id, table.kind, table.period_key),
	index("idx_leave_accruals_staff").on(table.staff_id),
]);

export const leave_requests = sqliteTable("leave_requests", {
	id: text().primaryKey().notNull(),
	staff_id: text().references(() => staff_members.id, { onDelete: "cascade" } ),
	leave_type: text().notNull(),
	start_date: text().notNull(),
	end_date: text().notNull(),
	reason: text(),
	status: text().default("대기"),
	approved_at: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	company_id: text().references(() => companies.id),
	days: real(),
},
(table) => [
	index("idx_leave_requests_staff_id").on(table.staff_id),
	index("idx_leave_requests_company_id").on(table.company_id),
]);

export const license_continuing_education = sqliteTable("license_continuing_education", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	license_id: text().references(() => staff_licenses.id, { onDelete: "set null" } ),
	license_type_hint: text(),
	license_name_hint: text(),
	file_url: text().notNull(),
	file_name: text(),
	status: text().default("pending").notNull(),
	submitted_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	submitted_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	ocr_text: text(),
	ocr_education_date: text(),
	ocr_extracted_meta: text(),
	education_date: text(),
	applied_expiry_date: text(),
	applied_renewed_date: text(),
	reject_reason: text(),
	reviewed_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	reviewed_at: text(),
	memo: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_license_ce_submitted_at").on(table.submitted_at),
	index("idx_license_ce_status").on(table.status),
	index("idx_license_ce_license_id").on(table.license_id),
	index("idx_license_ce_staff_id").on(table.staff_id),
]);

export const login_logs = sqliteTable("login_logs", {
	id: text().primaryKey().notNull(),
	user_id: text(),
	user_name: text(),
	action: text(),
	ip_address: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const medical_devices = sqliteTable("medical_devices", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	model: text(),
	serial: text(),
	category: text(),
	location: text(),
	cycle: integer().default(12),
	next_inspection_date: text(),
	last_inspection_date: text(),
	memo: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const meeting_bookings = sqliteTable("meeting_bookings", {
	id: text().primaryKey().notNull(),
	room: text().notNull(),
	date: text().notNull(),
	start_time: text(),
	end_time: text(),
	booker_id: text().references(() => staff_members.id),
	booker_name: text(),
	status: text().default("예약"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const message_bookmarks = sqliteTable("message_bookmarks", {
	id: text().primaryKey().notNull(),
	user_id: text().notNull(),
	message_id: text().notNull().references(() => messages.id, { onDelete: "cascade" } ),
	room_id: text().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_message_bookmarks_user_message").on(table.user_id, table.message_id),
]);

export const message_reactions = sqliteTable("message_reactions", {
	id: text().primaryKey().notNull(),
	message_id: text().notNull(),
	user_id: text().notNull(),
	emoji: text().default("👍"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_message_reactions_msg").on(table.message_id),
]);

export const message_reads = sqliteTable("message_reads", {
	id: text().primaryKey().notNull(),
	message_id: text().references(() => chat_messages.id, { onDelete: "cascade" } ),
	reader_id: text().references(() => staff_members.id),
	read_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	user_id: text(),
});

export const messages = sqliteTable("messages", {
	id: text().primaryKey().notNull(),
	room_id: text().notNull(),
	sender_id: text(),
	content: text(),
	file_url: text(),
	reply_to_id: text(),
	is_deleted: integer().default(0),
	edited_at: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	file_size_bytes: integer(),
	file_kind: text(),
	file_name: text(),
	album_id: text(),
	album_index: integer(),
	album_total: integer(),
	message_type: text().default("text"),
	sender_name: text(),
},
(table) => [
	index("idx_messages_sender").on(table.sender_id),
	index("idx_messages_room_unread_count").on(table.room_id, table.created_at),
	index("idx_messages_room_created_id_desc").on(table.room_id, table.created_at, table.id),
	index("idx_messages_room").on(table.room_id),
	foreignKey(() => ({
			columns: [table.reply_to_id],
			foreignColumns: [table.id],
			name: "messages_reply_to_id_messages_id_fk"
		})).onDelete("set null"),
]);

export const messenger_drive_links = sqliteTable("messenger_drive_links", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체"),
	room_id: text().references(() => chat_rooms.id, { onDelete: "cascade" } ),
	name: text().notNull(),
	url: text().default(""),
	sort_order: integer().default(0),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	updated_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_messenger_drive_links_room").on(table.room_id),
	index("idx_messenger_drive_links_company").on(table.company_name, table.sort_order, table.created_at),
]);

export const monthly_off_quota = sqliteTable("monthly_off_quota", {
	id: text().primaryKey().notNull(),
	company: text().notNull(),
	year_month: text().notNull(),
	default_off_days: integer().default(8),
	staff_overrides: text().default("{}"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_monthly_off_quota_year_month").on(table.year_month),
	index("idx_monthly_off_quota_company").on(table.company),
]);

export const mri_templates = sqliteTable("mri_templates", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	sort_order: integer().default(0),
	is_active: integer().default(1),
	body_part: text(),
});

export const notification_templates = sqliteTable("notification_templates", {
	id: text().primaryKey().notNull(),
	template_type: text().notNull(),
	name: text().notNull(),
	content: text().notNull(),
	variables: text().default("[]"),
	is_active: integer().default(1),
	company_name: text().default("전체"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const notifications = sqliteTable("notifications", {
	id: text().primaryKey().notNull(),
	user_id: text().references(() => staff_members.id, { onDelete: "cascade" } ),
	type: text(),
	title: text(),
	body: text(),
	metadata: text(),
	read_at: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_notifications_user_id").on(table.user_id),
]);

export const official_doc_log = sqliteTable("official_doc_log", {
	id: integer().primaryKey().notNull(),
	sent_date: text().notNull(),
	doc_number: text().default(""),
	title: text().default(""),
	recipient: text().default(""),
	manager: text().default(""),
	is_received: integer().default(0),
	note: text().default(""),
	company: text().default(""),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_official_doc_log_sent_date").on(table.sent_date),
	index("idx_official_doc_log_company").on(table.company),
]);

export const onboarding_checklists = sqliteTable("onboarding_checklists", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	checklist_type: text().notNull(),
	items: text().default("[]"),
	target_date: text(),
	completed_at: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_onboarding_staff").on(table.staff_id),
]);

export const op_check_templates = sqliteTable("op_check_templates", {
	id: text().primaryKey().notNull(),
	company_id: text(),
	company_name: text().default("전체"),
	template_scope: text().default("surgery"),
	template_name: text().notNull(),
	surgery_template_id: text(),
	surgery_name: text(),
	anesthesia_type: text(),
	prep_items: text().default("[]"),
	consumable_items: text().default("[]"),
	notes: text(),
	is_active: integer().default(1),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_by_name: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_op_check_templates_surgery_name").on(table.surgery_name),
	index("idx_op_check_templates_company_scope").on(table.company_id, table.template_scope, table.is_active),
	index("idx_op_check_templates_anesthesia").on(table.anesthesia_type),
]);

export const op_patient_checks = sqliteTable("op_patient_checks", {
	id: text().primaryKey().notNull(),
	schedule_post_id: text().notNull(),
	company_id: text(),
	company_name: text().default("전체"),
	patient_name: text().default(""),
	chart_no: text(),
	surgery_name: text().default(""),
	surgery_template_id: text(),
	anesthesia_type: text(),
	schedule_date: text(),
	schedule_time: text(),
	schedule_room: text(),
	prep_items: text().default("[]"),
	consumable_items: text().default("[]"),
	notes: text(),
	status: text().default("준비중"),
	applied_template_ids: text().default("{}"),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_by_name: text(),
	updated_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	updated_by_name: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	surgery_started_at: text(),
	surgery_ended_at: text(),
	ward_message_sent_at: text(),
},
(table) => [
	index("idx_op_patient_checks_patient_name").on(table.patient_name),
	index("idx_op_patient_checks_company_date").on(table.company_id, table.schedule_date, table.updated_at),
]);

export const org_teams = sqliteTable("org_teams", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체"),
	division: text().notNull(),
	team_name: text().notNull(),
	sort_order: integer().default(0),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	applicable_shifts: text(),
});

export const payroll = sqliteTable("payroll", {
	id: text().primaryKey().notNull(),
	company_id: text().references(() => companies.id, { onDelete: "cascade" } ),
	staff_id: text().references(() => staff_members.id, { onDelete: "cascade" } ),
	month: text().notNull(),
	base_salary: real().notNull(),
	total_salary: real().notNull(),
	status: text().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const payroll_approval_logs = sqliteTable("payroll_approval_logs", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체"),
	year_month: text().notNull(),
	actor_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	actor_name: text().notNull(),
	action: text().notNull(),
	comment: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_payroll_approval_logs_scope").on(table.company_name, table.year_month, table.created_at),
]);

export const payroll_approval_workflows = sqliteTable("payroll_approval_workflows", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체"),
	year_month: text().notNull(),
	step1_status: text().default("대기"),
	step2_status: text().default("대기"),
	step1_comment: text(),
	step2_comment: text(),
	step1_actor_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	step2_actor_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	step1_updated_at: text(),
	step2_updated_at: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_payroll_approval_workflows_scope").on(table.company_name, table.year_month),
]);

export const payroll_bonus_items = sqliteTable("payroll_bonus_items", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	company_name: text().notNull(),
	year_month: text().notNull(),
	category: text().default("상여"),
	amount: integer().default(0),
	note: text(),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_payroll_bonus_items_staff").on(table.staff_id, table.year_month),
	index("idx_payroll_bonus_items_company_month").on(table.company_name, table.year_month, table.created_at),
]);

export const payroll_calendar_items = sqliteTable("payroll_calendar_items", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체"),
	year_month: text().notNull(),
	title: text().notNull(),
	due_date: text().notNull(),
	owner_label: text().notNull(),
	status: text().default("대기"),
	sort_order: integer().default(0),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	updated_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_payroll_calendar_items_scope").on(table.company_name, table.year_month, table.sort_order),
]);

export const payroll_deduction_controls = sqliteTable("payroll_deduction_controls", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	company_name: text().notNull(),
	deduction_type: text().notNull(),
	monthly_amount: integer().default(0),
	balance: integer().default(0),
	note: text(),
	is_active: integer().default(1),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_payroll_deduction_controls_staff").on(table.staff_id, table.is_active),
	index("idx_payroll_deduction_controls_company").on(table.company_name, table.is_active, table.created_at),
]);

export const payroll_locks = sqliteTable("payroll_locks", {
	id: text().primaryKey().notNull(),
	year_month: text().notNull(),
	company_name: text().default("전체"),
	locked_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	locked_by: text(),
	memo: text(),
	reopen_requested_at: text(),
	reopen_requested_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	reopen_request_comment: text(),
	reopen_request_status: text(),
	reopen_reviewed_at: text(),
	reopen_reviewed_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	reopen_review_comment: text(),
},
(table) => [
	index("idx_payroll_locks_reopen_status").on(table.year_month, table.company_name, table.reopen_request_status),
]);

export const payroll_policy_versions = sqliteTable("payroll_policy_versions", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체"),
	effective_year: integer().notNull(),
	version_label: text().notNull(),
	snapshot: text().default("{}"),
	note: text(),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_payroll_policy_versions_scope").on(table.company_name, table.effective_year, table.created_at),
]);

export const payroll_records = sqliteTable("payroll_records", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	year_month: text().notNull(),
	base_salary: integer().default(0),
	meal_allowance: integer().default(0),
	vehicle_allowance: integer().default(0),
	childcare_allowance: integer().default(0),
	research_allowance: integer().default(0),
	other_taxfree: integer().default(0),
	extra_allowance: integer().default(0),
	overtime_pay: integer().default(0),
	bonus: integer().default(0),
	total_taxable: integer().default(0),
	total_taxfree: integer().default(0),
	total_deduction: integer().default(0),
	net_pay: integer().default(0),
	attendance_deduction: integer().default(0),
	attendance_deduction_detail: text(),
	status: text().default("임시"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	record_type: text().default("regular"),
	severance_pay: integer().default(0),
	settlement_reason: text(),
	settlement_date: text(),
	advance_pay: integer().default(0),
	deduction_detail: text().default("{}"),
	night_duty_allowance: integer().default(0),
	gross_pay: real(),
	national_pension: real(),
	health_insurance: real(),
	long_term_care: real(),
	employment_insurance: real(),
	income_tax: real(),
	local_tax: real(),
},
(table) => [
	uniqueIndex("idx_payroll_records_staff_ym_type_unique").on(table.staff_id, table.year_month, table.record_type),
	index("idx_payroll_records_staff_ym").on(table.staff_id, table.year_month),
]);

export const payroll_retro_adjustments = sqliteTable("payroll_retro_adjustments", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	company_name: text().notNull(),
	start_month: text().notNull(),
	end_month: text().notNull(),
	before_base: integer().default(0),
	after_base: integer().default(0),
	retro_total: integer().default(0),
	reason: text(),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_payroll_retro_adjustments_staff").on(table.staff_id, table.start_month, table.end_month),
	index("idx_payroll_retro_adjustments_company").on(table.company_name, table.created_at),
]);

export const personnel_appointments = sqliteTable("personnel_appointments", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	staff_name: text(),
	company: text(),
	order_type: text(),
	effective_date: text(),
	before_dept: text(),
	after_dept: text(),
	before_position: text(),
	after_position: text(),
	before_role: text(),
	after_role: text(),
	reason: text(),
	memo: text(),
	status: text().default("발령완료"),
	issued_by: text(),
	issued_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	new_department: text(),
});

export const pinned_messages = sqliteTable("pinned_messages", {
	id: text().primaryKey().notNull(),
	room_id: text().notNull(),
	message_id: text().notNull(),
	pinned_by: text(),
	pinned_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_pinned_room").on(table.room_id),
]);

export const poll_votes = sqliteTable("poll_votes", {
	id: text().primaryKey().notNull(),
	poll_id: text().notNull().references(() => polls.id, { onDelete: "cascade" } ),
	user_id: text().notNull(),
	option_index: integer().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const polls = sqliteTable("polls", {
	id: text().primaryKey().notNull(),
	room_id: text().notNull(),
	message_id: text(),
	creator_id: text(),
	question: text().notNull(),
	options: text().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_polls_room").on(table.room_id),
]);

export const popups = sqliteTable("popups", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	media_url: text(),
	media_type: text().default("image"),
	width: integer().default(400),
	height: integer().default(500),
	is_active: integer().default(1),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	link_url: text(),
	start_at: text(),
	end_at: text(),
	priority: integer().default(0),
},
(table) => [
	index("idx_popups_schedule_priority").on(table.is_active, table.priority, table.created_at),
	index("idx_popups_active_created").on(table.is_active, table.created_at),
]);

export const posts = sqliteTable("posts", {
	id: text().primaryKey().notNull(),
	board_type: text().default("공지사항"),
	title: text().notNull(),
	content: text(),
	author_id: text(),
	author_name: text(),
	company: text(),
	views: integer().default(0),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	company_id: text().references(() => companies.id),
},
(table) => [
	index("idx_posts_company_id_created_at").on(table.company_id, table.created_at),
]);

export const purchase_orders = sqliteTable("purchase_orders", {
	id: text().primaryKey().notNull(),
	supplier_id: text().references(() => suppliers.id, { onDelete: "restrict" } ),
	items: text().notNull(),
	status: text().default("대기"),
	total_amount: real(),
	notes: text(),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	approved_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	approved_at: text(),
	completed_at: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	supplier_name: text(),
	expected_delivery_date: text(),
	ordered_at: text(),
	received_at: text(),
	received_by_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	received_by_name: text(),
	inspected_at: text(),
	inspected_by_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	inspected_by_name: text(),
	inspection_status: text(),
	received_qty: real(),
	rejected_qty: real(),
	received_items: text().default("[]"),
	closed_at: text(),
	closed_by_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	closed_by_name: text(),
	expense_status: text().default("pending"),
	expense_posted_at: text(),
	expense_posted_by_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	expense_posted_by_name: text(),
	expense_total_amount: real(),
	tax_amount: real(),
	invoice_no: text(),
	invoice_date: text(),
	payment_status: text().default("unpaid"),
	payment_due_date: text(),
	cost_center: text(),
	budget_department: text(),
	account_code: text(),
	source_supply_approval_id: text().references(() => approvals.id, { onDelete: "set null" } ),
	source_supply_request_index: integer(),
	requester_company: text(),
	requester_department: text(),
},
(table) => [
	index("idx_purchase_orders_status").on(table.status),
	index("idx_purchase_orders_source_supply_approval").on(table.source_supply_approval_id, table.source_supply_request_index),
	index("idx_purchase_orders_inspection_status").on(table.inspection_status),
	index("idx_purchase_orders_expense_status").on(table.expense_status),
]);

export const push_subscriptions = sqliteTable("push_subscriptions", {
	id: text().primaryKey().notNull(),
	staff_id: text(),
	endpoint: text().notNull(),
	p256dh: text().notNull(),
	auth: text().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	fcm_token: text(),
	device_id: text(),
	platform: text(),
	user_agent: text(),
},
(table) => [
	index("idx_push_subscriptions_staff_id").on(table.staff_id),
	uniqueIndex("idx_push_subscriptions_staff_endpoint").on(table.staff_id, table.endpoint),
	// 부분 유니크 인덱스: device_id=NULL인 VAPID 구독이 여럿이어도 충돌 없도록
	// Postgres 마이그레이션(20260416_push_subscriptions_device_columns_and_dedupe.sql)의
	// WHERE staff_id IS NOT NULL AND device_id IS NOT NULL 와 동일한 동작 보장.
	// SQLite는 NULL을 UNIQUE 대상에서 제외하지 않으므로 명시적 WHERE 절 필수.
	uniqueIndex("idx_push_subscriptions_staff_device_unique")
		.on(table.staff_id, table.device_id)
		.where(sql`staff_id IS NOT NULL AND device_id IS NOT NULL`),
	// fcm_token 부분 유니크: NULL fcm_token 행이 여럿이어도 충돌 없도록
	// Postgres WHERE fcm_token IS NOT NULL 과 동일.
	uniqueIndex("idx_push_subscriptions_fcm_token_unique")
		.on(table.fcm_token)
		.where(sql`fcm_token IS NOT NULL`),
	index("idx_push_subscriptions_fcm_token").on(table.fcm_token),
]);

export const report_schedules = sqliteTable("report_schedules", {
	id: text().primaryKey().notNull(),
	company_id: text(),
	report_type: text().notNull(),
	schedule_cron: text(),
	recipients: text().default("[]"),
	enabled: integer().default(1),
	last_generated_at: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_report_schedules_enabled").on(table.enabled, table.report_type),
]);

export const retirement_pensions = sqliteTable("retirement_pensions", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	staff_name: text(),
	pension_type: text().default("unregistered"),
	joined_date: text(),
	account_number: text(),
	fund_name: text(),
	monthly_contribution: real(),
	total_accumulated: real(),
	memo: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_retirement_pensions_type").on(table.pension_type),
	uniqueIndex("idx_retirement_pensions_staff_id").on(table.staff_id),
]);

export const reward_discipline = sqliteTable("reward_discipline", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	staff_name: text(),
	company: text(),
	department: text(),
	category: text(),
	type: text(),
	date: text(),
	reason: text(),
	detail: text(),
	amount: real(),
	committee_date: text(),
	committee_members: text(),
	committee_result: text(),
	memo: text(),
	issued_by: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const room_notification_settings = sqliteTable("room_notification_settings", {
	id: text().primaryKey().notNull(),
	user_id: text().notNull(),
	room_id: text().notNull(),
	notifications_enabled: integer().default(1),
});

export const room_read_cursors = sqliteTable("room_read_cursors", {
	id: text().primaryKey().notNull(),
	user_id: text().notNull(),
	room_id: text().notNull(),
	last_read_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_room_read_cursors_room_user").on(table.room_id, table.user_id),
]);

export const roster_approval_requests = sqliteTable("roster_approval_requests", {
	id: numeric().primaryKey(),
	company_name: text(),
	team_name: text(),
	year_month: text().notNull(),
	assignments: text().default("[]").notNull(),
	requested_by: numeric().references(() => staff_members.id, { onDelete: "set null" } ),
	requested_by_name: text(),
	status: text().default("pending").notNull(),
	approved_by: numeric().references(() => staff_members.id, { onDelete: "set null" } ),
	approved_at: text(),
	rejected_by: numeric().references(() => staff_members.id, { onDelete: "set null" } ),
	rejected_at: text(),
	reject_reason: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const roster_policy_settings = sqliteTable("roster_policy_settings", {
	id: numeric().primaryKey(),
	policy_type: text().notNull(),
	policy_id: text().notNull(),
	company_id: numeric().references(() => companies.id, { onDelete: "cascade" } ),
	company_name: text().default("전체").notNull(),
	name: text().notNull(),
	payload: text().default("{}").notNull(),
	created_by: numeric().references(() => staff_members.id, { onDelete: "set null" } ),
	updated_by: numeric().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
},
(table) => [
	uniqueIndex("idx_roster_policy_settings_type_id_unique").on(table.policy_type, table.policy_id),
]);

export const roster_swap_requests = sqliteTable("roster_swap_requests", {
	id: numeric().primaryKey(),
	company_name: text(),
	team_name: text(),
	requested_by: numeric().references(() => staff_members.id, { onDelete: "set null" } ),
	requested_by_name: text(),
	staff_id: numeric().references(() => staff_members.id, { onDelete: "cascade" } ),
	work_date: numeric().notNull(),
	target_date: numeric().notNull(),
	current_shift_id: numeric().references(() => work_shifts.id, { onDelete: "set null" } ),
	reason: text(),
	status: text().default("pending").notNull(),
	approved_by: numeric().references(() => staff_members.id, { onDelete: "set null" } ),
	approved_at: text(),
	rejected_by: numeric().references(() => staff_members.id, { onDelete: "set null" } ),
	rejected_at: text(),
	reject_reason: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const salary_change_history = sqliteTable("salary_change_history", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	change_type: text().notNull(),
	before_value: integer(),
	after_value: integer(),
	effective_date: text().notNull(),
	reason: text(),
	created_by: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	previous_salary: real(),
},
(table) => [
	index("idx_salary_change_staff_date").on(table.staff_id, table.effective_date),
	index("idx_salary_change_staff").on(table.staff_id),
	index("idx_salary_change_date").on(table.effective_date),
]);

export const scheduled_messages = sqliteTable("scheduled_messages", {
	id: text().primaryKey().notNull(),
	room_id: text().notNull().references(() => chat_rooms.id, { onDelete: "cascade" } ),
	sender_id: text().notNull(),
	content: text().notNull(),
	scheduled_at: text().notNull(),
	is_sent: integer().default(0),
	reply_to_id: text().references(() => messages.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_scheduled_messages_sender").on(table.sender_id, table.is_sent, table.scheduled_at),
]);

export const shift_assignments = sqliteTable("shift_assignments", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	work_date: text().notNull(),
	shift_id: text(),
	company_name: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	shift_name: text(),
},
(table) => [
	index("idx_shift_assignments_work_date").on(table.work_date),
	index("idx_shift_assignments_staff").on(table.staff_id),
]);

export const staff_certifications = sqliteTable("staff_certifications", {
	id: text().primaryKey().notNull(),
	staff_id: text().references(() => staff_members.id, { onDelete: "cascade" } ),
	name: text().notNull(),
	issuer: text(),
	issue_date: text(),
	expiry_date: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const staff_evaluations = sqliteTable("staff_evaluations", {
	id: text().primaryKey().notNull(),
	staff_id: text().references(() => staff_members.id, { onDelete: "cascade" } ),
	evaluator_id: text().references(() => staff_members.id, { onDelete: "set null" } ),
	category: text().notNull(),
	content: text().notNull(),
	score: integer(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_staff_evaluations_staff_id").on(table.staff_id),
]);

export const staff_job_categories = sqliteTable("staff_job_categories", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	job_category_id: text().notNull().references(() => job_categories.id),
	is_primary: integer().default(0),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_staff_job_categories_staff_id").on(table.staff_id),
	index("idx_staff_job_categories_job_category_id").on(table.job_category_id),
]);

export const staff_licenses = sqliteTable("staff_licenses", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	license_name: text(),
	license_number: text(),
	issued_date: text(),
	expiry_date: text(),
	issuing_body: text(),
	memo: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	license_type: text(),
	is_primary: integer().default(0),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	renewed_date: text(),
	attachment_url: text(),
	copy_url: text(),
	document_url: text(),
	document_file_url: text(),
	license_file_url: text(),
},
(table) => [
	uniqueIndex("uq_staff_licenses_staff_number").on(table.staff_id, table.license_number),
	index("idx_staff_licenses_staff_id_is_primary").on(table.staff_id, table.is_primary),
	index("idx_staff_licenses_staff_id").on(table.staff_id),
	index("idx_staff_licenses_expiry_date").on(table.expiry_date),
]);

export const staff_members = sqliteTable("staff_members", {
	id: text().primaryKey().notNull(),
	employee_no: text().notNull(),
	name: text().notNull(),
	company: text().notNull(),
	company_id: text().references(() => companies.id),
	department: text(),
	position: text(),
	team: text(),
	email: text(),
	phone: text(),
	resident_no: text(),
	address: text(),
	license: text(),
	bank_account: text(),
	salary_info: text(),
	join_date: text(),
	joined_at: text(),
	resigned_at: text(),
	status: text().default("재직"),
	role: text().default("user"),
	permissions: text().default("{}"),
	password: text(),
	annual_leave_total: real().default(15),
	annual_leave_used: real(),
	shift_id: text().references(() => work_shifts.id),
	base_salary: integer().default(0),
	other_taxfree: integer().default(0),
	position_allowance: integer().default(0),
	overtime_allowance: integer().default(0),
	night_work_allowance: integer().default(0),
	holiday_work_allowance: integer().default(0),
	annual_leave_pay: integer().default(0),
	working_hours_per_week: real().default(40),
	working_days_per_week: integer().default(5),
	last_seen_at: text(),
	presence_status: text().default("away"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	auth_user_id: text(),
	meal_allowance: integer().default(0),
	night_duty_allowance: integer().default(0),
	vehicle_allowance: integer().default(0),
	childcare_allowance: integer().default(0),
	research_allowance: integer().default(0),
	birth_date: text(),
	is_system_master: integer().default(0),
	avatar_url: text(),
	photo_url: text(),
	profile_photo_path: text(),
	profile_photo_updated_at: text(),
	force_logout_at: text(),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	hire_date: text(),
	resign_date: text(),
	bank_name: text(),
	passwd: text(),
	employment_type: text(),
	staff_email: text(),
	annual_days: real(),
	annual_used: real(),
	gender: text(),
	salary: real(),
	extension: text(),
	contract_type: text(),
	password_reset_required: integer().default(0),
},
(table) => [
	index("idx_staff_members_shift_id").on(table.shift_id),
	index("idx_staff_members_company_id").on(table.company_id),
	uniqueIndex("idx_staff_members_auth_user_id").on(table.auth_user_id),
]);

export const staff_preferred_off = sqliteTable("staff_preferred_off", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	year_month: text().notNull(),
	preferred_weekdays: text().default("{}"),
	preferred_dates: text().default("{}"),
	notes: text().default(""),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_staff_preferred_off_year_month").on(table.year_month),
	index("idx_staff_preferred_off_staff_id").on(table.staff_id),
]);

export const staff_shift_assignments = sqliteTable("staff_shift_assignments", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	shift_id: text().notNull().references(() => work_shifts.id),
	is_primary: integer().default(0),
	priority: integer().default(0),
	effective_from: text(),
	effective_to: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_staff_shift_assignments_staff_id_is_primary").on(table.staff_id, table.is_primary),
	index("idx_staff_shift_assignments_staff_id").on(table.staff_id),
	index("idx_staff_shift_assignments_shift_id").on(table.shift_id),
]);

export const staff_trainings = sqliteTable("staff_trainings", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	training_code: text().notNull(),
	training_name: text().notNull(),
	assigned_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	mandatory: integer().default(1),
	obligation_type: text().default("legal"),
	cycle_months: integer(),
	status: text().default("미이수"),
	completed_at: text(),
	certificate_url: text(),
	memo: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_staff_trainings_training_code").on(table.training_code),
	index("idx_staff_trainings_status").on(table.status),
	index("idx_staff_trainings_staff_id").on(table.staff_id),
]);

export const staff_transfer_history = sqliteTable("staff_transfer_history", {
	id: text().primaryKey().notNull(),
	staff_id: text().references(() => staff_members.id, { onDelete: "cascade" } ),
	transfer_type: text(),
	before_value: text(),
	after_value: text(),
	effective_date: text(),
	approval_id: text().references(() => approvals.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const suppliers = sqliteTable("suppliers", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	contact: text(),
	phone: text(),
	address: text(),
	email: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	contact_name: text(),
	business_number: text(),
	category: text(),
	contract_start: text(),
	contract_end: text(),
	payment_terms: text(),
	notes: text(),
	created_by: text(),
});

export const surgery_templates = sqliteTable("surgery_templates", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	sort_order: integer().default(0),
	is_active: integer().default(1),
	body_part: text(),
});

export const system_configs = sqliteTable("system_configs", {
	key: text().primaryKey().notNull(),
	value: text(),
	description: text(),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const system_settings = sqliteTable("system_settings", {
	key: text().primaryKey().notNull(),
	value: text(),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const tasks = sqliteTable("tasks", {
	id: text().primaryKey().notNull(),
	title: text().notNull(),
	content: text(),
	status: text().default("todo"),
	priority: text().default("medium"),
	assignee_id: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const tax_free_settings = sqliteTable("tax_free_settings", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체"),
	meal_limit: integer().default(200000),
	vehicle_limit: integer().default(200000),
	childcare_limit: integer().default(100000),
	research_limit: integer().default(200000),
	uniform_limit: integer().default(300000),
	congratulations_limit: integer().default(500000),
	housing_limit: integer().default(700000),
	other_taxfree_limit: integer().default(0),
	effective_year: integer().default(2025),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const tax_insurance_rates = sqliteTable("tax_insurance_rates", {
	id: text().primaryKey().notNull(),
	effective_year: integer().notNull(),
	company_name: text().default("전체"),
	national_pension_rate: real().default(0.045),
	health_insurance_rate: real().default(0.03545),
	long_term_care_rate: real().default(0.00459),
	employment_insurance_rate: real().default(0.009),
	income_tax_bracket: text().default("[]"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const tax_reports = sqliteTable("tax_reports", {
	id: text().primaryKey().notNull(),
	year: text().notNull(),
	company_name: text(),
	report_type: text().notNull(),
	report_date: text(),
	data: text().default("[]"),
	status: text().default("draft"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_tax_reports_year_company").on(table.year, table.company_name, table.report_type),
]);

export const todo_reminder_logs = sqliteTable("todo_reminder_logs", {
	id: text().primaryKey().notNull(),
	todo_id: text().notNull(),
	user_id: text().notNull().references(() => staff_members.id, { onDelete: "cascade" } ),
	reminder_at: text().notNull(),
	notification_id: text().references(() => notifications.id, { onDelete: "set null" } ),
	status: text().default("sent"),
	title: text(),
	body: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	uniqueIndex("idx_todo_reminder_logs_unique").on(table.user_id, table.todo_id, table.reminder_at),
	index("idx_todo_reminder_logs_created").on(table.user_id, table.created_at),
]);

export const todos = sqliteTable("todos", {
	id: text().primaryKey().notNull(),
	user_id: text().notNull(),
	content: text().notNull(),
	is_complete: integer().default(0),
	task_date: text().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	source_message_id: text(),
	source_room_id: text(),
	repeat_parent_id: text(),
	repeat_generated_from_id: text(),
	priority: text().default("medium"),
	reminder_at: text(),
	repeat_type: text().default("none"),
	assignee_kind: text().default("self"),
},
(table) => [
	index("idx_todos_user_date").on(table.user_id, table.task_date),
	index("idx_todos_source_message").on(table.user_id, table.source_room_id, table.source_message_id),
	index("idx_todos_repeat_parent_date").on(table.user_id, table.repeat_parent_id, table.task_date),
	index("idx_todos_reminder_at").on(table.reminder_at),
	index("idx_todos_priority_date").on(table.user_id, table.priority, table.task_date),
]);

export const unpaid_absence_records = sqliteTable("unpaid_absence_records", {
	id: text().primaryKey().notNull(),
	staff_id: text().notNull(),
	staff_name: text(),
	year_month: text().notNull(),
	absent_days: real(),
	monthly_salary: integer().default(0),
	working_days: integer().default(0),
	daily_wage: real(),
	deduction_amount: integer().default(0),
	note: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

export const virtual_account_deposits = sqliteTable("virtual_account_deposits", {
	id: text().primaryKey().notNull(),
	company_id: text(),
	provider: text().default("generic"),
	dedupe_key: text().notNull(),
	provider_event_type: text(),
	provider_event_id: text(),
	order_id: text(),
	order_name: text(),
	payment_key: text(),
	transaction_key: text(),
	method: text(),
	deposit_status: text().default("issued"),
	match_status: text().default("unmatched"),
	amount: real(),
	currency: text().default("KRW"),
	depositor_name: text(),
	customer_name: text(),
	patient_name: text(),
	patient_id: text(),
	transaction_label: text(),
	bank_code: text(),
	bank_name: text(),
	account_number: text(),
	due_date: text(),
	deposited_at: text(),
	matched_target_type: text(),
	matched_target_id: text(),
	matched_note: text(),
	raw_payload: text().default("{}"),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_virtual_account_deposits_status").on(table.deposit_status, table.match_status),
	index("idx_virtual_account_deposits_deposited_at").on(table.deposited_at),
	uniqueIndex("idx_virtual_account_deposits_dedupe_key").on(table.dedupe_key),
	index("idx_virtual_account_deposits_company_created_at").on(table.company_id, table.created_at),
]);

export const wiki_document_versions = sqliteTable("wiki_document_versions", {
	id: text().primaryKey().notNull(),
	document_id: text().notNull().references(() => wiki_documents.id, { onDelete: "cascade" } ),
	version_no: integer().notNull(),
	title: text().notNull(),
	summary: text(),
	content: text().default(""),
	tags: text().default("{}"),
	editor_ids: text().default("{}"),
	company_id: text(),
	company_name: text().default("전체"),
	change_summary: text(),
	restore_of_version_id: text(),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_wiki_document_versions_document_created").on(table.document_id, table.created_at),
	foreignKey(() => ({
			columns: [table.restore_of_version_id],
			foreignColumns: [table.id],
			name: "wiki_document_versions_restore_of_version_id_wiki_document_versions_id_fk"
		})).onDelete("set null"),
]);

export const wiki_documents = sqliteTable("wiki_documents", {
	id: text().primaryKey().notNull(),
	folder_id: text().notNull().references(() => wiki_folders.id, { onDelete: "cascade" } ),
	company_id: text(),
	company_name: text().default("전체"),
	title: text().notNull(),
	summary: text(),
	content: text().default(""),
	tags: text().default("{}"),
	editor_ids: text().default("{}"),
	is_published: integer().default(1),
	is_archived: integer().default(0),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	updated_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_wiki_documents_folder_updated").on(table.folder_id, table.updated_at),
	index("idx_wiki_documents_company_title").on(table.company_id, table.title),
]);

export const wiki_folders = sqliteTable("wiki_folders", {
	id: text().primaryKey().notNull(),
	company_id: text(),
	company_name: text().default("전체"),
	name: text().notNull(),
	description: text(),
	color: text(),
	sort_order: integer().default(0),
	is_archived: integer().default(0),
	created_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	updated_by: text().references(() => staff_members.id, { onDelete: "set null" } ),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_wiki_folders_company_sort").on(table.company_id, table.sort_order, table.created_at),
]);

export const work_shifts = sqliteTable("work_shifts", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	start_time: text().notNull(),
	end_time: text().notNull(),
	break_start_time: text(),
	break_end_time: text(),
	description: text(),
	company_name: text(),
	shift_type: text(),
	weekly_work_days: integer().default(5),
	is_weekend_work: integer().default(0),
	is_shift: integer().default(0),
	is_active: integer().default(1),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
});

// ---------------------------------------------------------------------------
// rate_limit_attempts — 분산 Workers 환경에서 레이트리밋 상태를 D1에 영속
// key: 식별자 (loginId, ip:userId 등), count: 윈도우 내 실패 횟수,
// window_start: 윈도우 시작 epoch ms(TEXT), updated_at: 마지막 시도 시각
// ---------------------------------------------------------------------------
export const rate_limit_attempts = sqliteTable("rate_limit_attempts", {
	key: text().primaryKey().notNull(),
	count: integer().notNull().default(0),
	window_start: text().notNull(),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_rate_limit_attempts_window_start").on(table.window_start),
]);

export const company_welfare_policies = sqliteTable("company_welfare_policies", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체").notNull(),
	rule_name: text().notNull(),
	rule_value: text().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	uniqueIndex("idx_company_welfare_policies_unique").on(table.company_name, table.rule_name),
]);

export const company_payroll_policies = sqliteTable("company_payroll_policies", {
	id: text().primaryKey().notNull(),
	company_name: text().default("전체").notNull(),
	rule_label: text().notNull(),
	rule_value: text().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	uniqueIndex("idx_company_payroll_policies_unique").on(table.company_name, table.rule_label),
]);

// ─────────────────────────────────────────────────────────────
// 무음 실패 복구 — 미존재 기능 테이블 8종 (2026-05-30)
// 소비처가 supabase.from()/enqueueSupabaseMutation으로 호출하나 D1에
// 실테이블이 없어 무음 실패하던 기능들을 신설. 컬럼은 각 소비처 코드의
// insert/select/update 실제 사용 컬럼에서 추출.
// ─────────────────────────────────────────────────────────────

// 수술상담 (모바일/추가기능/수술상담.tsx)
export const op_consultations = sqliteTable("op_consultations", {
	id: text().primaryKey().notNull(),
	patient_name: text().notNull(),
	surgery_type: text(),
	status: text(),
	note: text(),
	staff_id: text().references(() => staff_members.id),
	staff_name: text(),
	company: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_op_consultations_company_created").on(table.company, table.created_at),
	index("idx_op_consultations_staff_id").on(table.staff_id),
]);

// 경조사관리 (기능부품/인사관리서브/경조사관리.tsx)
export const congratulations_condolences = sqliteTable("congratulations_condolences", {
	id: text().primaryKey().notNull(),
	staff_id: text().references(() => staff_members.id),
	staff_name: text(),
	department: text(),
	event_type: text(),
	event_date: text(),
	amount: integer().default(0),
	relation: text(),
	recipient: text(),
	memo: text(),
	wreath_sent: integer().default(0),
	company: text(),
	status: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_congrats_company_event_date").on(table.company, table.event_date),
	index("idx_congrats_event_type").on(table.event_type),
]);

// 조기퇴근감지 (기능부품/인사관리서브/조기퇴근감지.tsx)
export const early_leave_records = sqliteTable("early_leave_records", {
	id: text().primaryKey().notNull(),
	staff_id: text().references(() => staff_members.id),
	staff_name: text(),
	dept: text(),
	work_date: text(),
	scheduled_end: text(),
	actual_end: text(),
	early_minutes: integer().default(0),
	is_approved: integer().default(0),
	note: text(),
	company: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_early_leave_work_date").on(table.work_date),
	index("idx_early_leave_staff_id").on(table.staff_id),
]);

// 계약서자동생성 (기능부품/인사관리서브/계약서자동생성.tsx)
export const generated_contracts = sqliteTable("generated_contracts", {
	id: text().primaryKey().notNull(),
	contract_type: text(),
	staff_id: text().references(() => staff_members.id),
	staff_name: text(),
	position: text(),
	department: text(),
	salary: text(),
	start_date: text(),
	end_date: text(),
	company_name: text(),
	representative: text(),
	work_location: text(),
	work_hours: text(),
	note: text(),
	created_by: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_generated_contracts_company").on(table.company_name, table.created_at),
	index("idx_generated_contracts_staff_id").on(table.staff_id),
]);

// 게시판 별표 (모바일/게시판/별표훅.ts) — post_id+user_id 복합 unique
export const board_post_stars = sqliteTable("board_post_stars", {
	id: text().primaryKey().notNull(),
	post_id: text().notNull(),
	user_id: text().notNull(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	uniqueIndex("idx_board_post_stars_post_user").on(table.post_id, table.user_id),
	index("idx_board_post_stars_user_id").on(table.user_id),
]);

// AS 수리 (기능부품/재고관리서브/AS반품관리.tsx)
export const as_repair_records = sqliteTable("as_repair_records", {
	id: text().primaryKey().notNull(),
	device_name: text().notNull(),
	model_name: text(),
	received_date: text(),
	problem_description: text(),
	company_name: text(),
	manager_name: text(),
	status: text(),
	created_by: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_as_repair_status_created").on(table.status, table.created_at),
]);

// 반품 (기능부품/재고관리서브/AS반품관리.tsx)
export const return_records = sqliteTable("return_records", {
	id: text().primaryKey().notNull(),
	item_name: text().notNull(),
	quantity: integer().default(1),
	return_reason: text(),
	company_name: text(),
	return_date: text(),
	status: text(),
	created_by: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_return_records_status_created").on(table.status, table.created_at),
]);

// 메시지 템플릿 (관리자 운영설정 — 운영설정.tsx, MessageTemplatesTab.tsx, data-hooks.ts)
export const message_templates = sqliteTable("message_templates", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	channel: text(),
	send_count: integer().default(0),
	last_sent_label: text(),
	status: text().default("활성"),
	content: text(),
	template_group: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	index("idx_message_templates_name").on(table.name),
]);

// 외부 연동 (관리자 운영설정 — IntegrationsTab.tsx, 운영설정.tsx)
export const external_integrations = sqliteTable("external_integrations", {
	id: text().primaryKey().notNull(),
	vendor: text().notNull(),
	name: text(),
	sub: text(),
	status: text().default("connected"),
	last_synced_label: text(),
	created_at: text().default(sql`(CURRENT_TIMESTAMP)`),
	updated_at: text().default(sql`(CURRENT_TIMESTAMP)`),
},
(table) => [
	uniqueIndex("idx_external_integrations_vendor").on(table.vendor),
]);



