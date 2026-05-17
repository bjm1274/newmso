-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `access_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`user_name` text,
	`company` text,
	`menu` text,
	`action` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_access_logs_user_created_at` ON `access_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_access_logs_created_at` ON `access_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_access_logs_company_menu_created_at` ON `access_logs` (`company`,`menu`,`created_at`);--> statement-breakpoint
CREATE TABLE `annual_leave_promotion_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`company_name` text,
	`target_year` integer NOT NULL,
	`step` integer NOT NULL,
	`sent_at` text DEFAULT (CURRENT_TIMESTAMP),
	`remain_days` real,
	`meta` text,
	`stage` integer,
	`expiry_date` text,
	`notified_at` text DEFAULT (CURRENT_TIMESTAMP),
	`plan_submitted_at` text,
	`remaining_days_at_notice` real,
	`notification_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_annual_leave_promotion_logs_staff_year` ON `annual_leave_promotion_logs` (`staff_id`,`target_year`,`step`);--> statement-breakpoint
CREATE INDEX `idx_alpl_stage` ON `annual_leave_promotion_logs` (`stage`);--> statement-breakpoint
CREATE INDEX `idx_alpl_staff_id` ON `annual_leave_promotion_logs` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_alpl_expiry_date` ON `annual_leave_promotion_logs` (`expiry_date`);--> statement-breakpoint
CREATE TABLE `approval_delegation` (
	`id` text PRIMARY KEY NOT NULL,
	`delegator_id` text,
	`delegate_id` text,
	`start_date` text,
	`end_date` text,
	`is_active` integer DEFAULT true,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`delegate_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`delegator_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `approval_form_types` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0,
	`is_active` integer DEFAULT true,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_approval_form_types_active` ON `approval_form_types` (`is_active`);--> statement-breakpoint
CREATE TABLE `approval_history` (
	`id` text PRIMARY KEY NOT NULL,
	`approval_id` text NOT NULL,
	`approver_id` text,
	`approver_name` text,
	`action` text NOT NULL,
	`comment` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_approval_history_approval` ON `approval_history` (`approval_id`);--> statement-breakpoint
CREATE TABLE `approval_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`form_type` text NOT NULL,
	`default_values` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`sender_id` text,
	`sender_name` text,
	`sender_company` text,
	`type` text,
	`title` text NOT NULL,
	`content` text,
	`status` text DEFAULT '대기',
	`current_approver_id` text,
	`meta_data` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text,
	`sender_department` text,
	`approver_line` text,
	`doc_number` text,
	`approval_line` text,
	`name` text,
	`doc_type` text,
	FOREIGN KEY (`sender_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_approvals_doc_number` ON `approvals` (`doc_number`);--> statement-breakpoint
CREATE INDEX `idx_approvals_company_id_status_created_at` ON `approvals` (`company_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `asset_loan_item_settings` (
	`company_name` text PRIMARY KEY,
	`items` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asset_loans` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`asset_type` text NOT NULL,
	`asset_name` text,
	`loaned_at` text NOT NULL,
	`returned_at` text,
	`condition_notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_asset_staff` ON `asset_loans` (`staff_id`);--> statement-breakpoint
CREATE TABLE `attendance` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`date` text NOT NULL,
	`check_in` text,
	`check_out` text,
	`status` text DEFAULT '정상',
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`company_id` text,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_attendance_staff_date` ON `attendance` (`staff_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_company_id` ON `attendance` (`company_id`);--> statement-breakpoint
CREATE TABLE `attendance_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`original_date` text,
	`correction_type` text,
	`reason` text,
	`status` text DEFAULT '대기',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`attendance_date` text,
	`requested_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `attendance_deduction_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체',
	`late_deduction_type` text DEFAULT 'fixed',
	`late_deduction_amount` integer DEFAULT 10000,
	`early_leave_deduction_type` text DEFAULT 'fixed',
	`early_leave_deduction_amount` integer DEFAULT 10000,
	`absent_use_daily_rate` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `attendances` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`company_id` text,
	`company_name` text,
	`work_date` text NOT NULL,
	`check_in_time` text,
	`check_out_time` text,
	`status` text DEFAULT 'present',
	`work_hours_minutes` integer,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_attendances_work_date` ON `attendances` (`work_date`);--> statement-breakpoint
CREATE INDEX `idx_attendances_staff_date` ON `attendances` (`staff_id`,`work_date`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`user_name` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`details` text,
	`ip_address` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`actor_name` text
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `backup_restore_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`meta` text DEFAULT '{}',
	`preview` text DEFAULT '[]',
	`result_summary` text DEFAULT '{}',
	`log_lines` text DEFAULT '{}',
	`total_tables` integer DEFAULT 0,
	`total_rows` integer DEFAULT 0,
	`status` text DEFAULT 'running',
	`requested_by` text,
	`requested_by_name` text,
	`started_at` text DEFAULT (CURRENT_TIMESTAMP),
	`finished_at` text,
	FOREIGN KEY (`requested_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_backup_restore_runs_started` ON `backup_restore_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `board_post_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text,
	`author_id` text,
	`author_name` text,
	`content` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`parent_comment_id` text,
	`is_anonymous` integer DEFAULT 0,
	FOREIGN KEY (`post_id`) REFERENCES `board_posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_comment_id`) REFERENCES `board_post_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_board_post_comments_parent_comment_id` ON `board_post_comments` (`parent_comment_id`);--> statement-breakpoint
CREATE TABLE `board_post_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text,
	`user_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_board_post_likes_user_id` ON `board_post_likes` (`user_id`);--> statement-breakpoint
CREATE TABLE `board_post_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` text DEFAULT (CURRENT_TIMESTAMP),
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`user_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `board_posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_board_post_reads_user_id` ON `board_post_reads` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_board_post_reads_post_id` ON `board_post_reads` (`post_id`);--> statement-breakpoint
CREATE TABLE `board_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`board_type` text,
	`title` text NOT NULL,
	`content` text,
	`author_id` text,
	`author_name` text,
	`company` text,
	`views` integer DEFAULT 0,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`is_anonymous` integer DEFAULT 0,
	`poll` text,
	`poll_votes` text DEFAULT '{}',
	`likes_count` integer DEFAULT 0,
	`status` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`board_id` text,
	`tags` text DEFAULT '[]',
	`attachments` text DEFAULT '[]',
	`is_pinned` integer DEFAULT 0,
	`scheduled_publish_at` text,
	`schedule_date` text,
	`schedule_time` text,
	`schedule_room` text,
	`patient_name` text,
	`surgery_fasting` integer DEFAULT 0,
	`surgery_inpatient` integer DEFAULT 0,
	`surgery_guardian` integer DEFAULT 0,
	`surgery_caregiver` integer DEFAULT 0,
	`surgery_transfusion` integer DEFAULT 0,
	`mri_contrast_required` integer DEFAULT 0,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_board_posts_schedule_date` ON `board_posts` (`schedule_date`);--> statement-breakpoint
CREATE INDEX `idx_board_posts_company_id_board_type_created_at` ON `board_posts` (`company_id`,`board_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_board_posts_company_id` ON `board_posts` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_board_posts_board_type_created_desc` ON `board_posts` (`board_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_board_posts_board_id_created_at` ON `board_posts` (`board_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `certificate_issuances` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`cert_type` text NOT NULL,
	`serial_no` text,
	`purpose` text,
	`issued_by` text,
	`issued_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issued_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text,
	`sender_id` text,
	`content` text NOT NULL,
	`type` text DEFAULT 'text',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`sender_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_push_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`room_id` text NOT NULL,
	`sender_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`processing_started_at` text,
	`processed_at` text,
	`attempt_count` integer DEFAULT 0,
	`last_error` text,
	`next_attempt_at` text DEFAULT (CURRENT_TIMESTAMP),
	`dead_lettered_at` text,
	FOREIGN KEY (`sender_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_push_jobs_ready` ON `chat_push_jobs` (`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_push_jobs_processing_started_at` ON `chat_push_jobs` (`processing_started_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_push_jobs_pending` ON `chat_push_jobs` (`processed_at`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_push_jobs_message_id` ON `chat_push_jobs` (`message_id`);--> statement-breakpoint
CREATE TABLE `chat_room_favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `chat_room_prefs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`pinned` integer DEFAULT 0,
	`hidden` integer DEFAULT 0,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`user_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_room_prefs_user_id` ON `chat_room_prefs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_room_prefs_room_id` ON `chat_room_prefs` (`room_id`);--> statement-breakpoint
CREATE TABLE `chat_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`type` text,
	`members` text,
	`is_announcement` integer DEFAULT 0,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`last_message_at` text,
	`last_message` text,
	`last_message_preview` text,
	`member_ids` text DEFAULT '{}'
);
--> statement-breakpoint
CREATE INDEX `idx_chat_rooms_last_message_at_desc` ON `chat_rooms` (`last_message_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`mso_id` text,
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`ceo_name` text,
	`business_no` text,
	`address` text,
	`phone` text,
	`memo` text,
	`payment_day` integer DEFAULT 7,
	`business_number` text,
	`seal_url` text,
	`leave_policy` text DEFAULT '입사일',
	`unused_leave_compensation` integer DEFAULT 0,
	`fiscal_year_start_month` integer DEFAULT 1,
	FOREIGN KEY (`mso_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `company_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`year_month` text NOT NULL,
	`rent` real DEFAULT 0,
	`materials` real DEFAULT 0,
	`utilities` real DEFAULT 0,
	`others` real DEFAULT 0,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_company_expenses_company_month` ON `company_expenses` (`company`,`year_month`);--> statement-breakpoint
CREATE TABLE `company_holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체',
	`holiday_date` text NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`created_by` text,
	`created_by_name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_company_holidays_scope_date` ON `company_holidays` (`company_name`,`holiday_date`);--> statement-breakpoint
CREATE TABLE `company_seals` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`type` text DEFAULT '대표인' NOT NULL,
	`image_url` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contract_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`template_content` text,
	`seal_url` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `corporate_card_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`card_holder_id` text,
	`transaction_date` text NOT NULL,
	`merchant` text,
	`category` text,
	`amount` integer DEFAULT 0,
	`description` text,
	`receipt_url` text,
	`company_name` text DEFAULT '전체',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`card_id` text,
	FOREIGN KEY (`card_id`) REFERENCES `corporate_cards`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_card_date` ON `corporate_card_transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `idx_card_category` ON `corporate_card_transactions` (`category`);--> statement-breakpoint
CREATE TABLE `corporate_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`card_nickname` text,
	`last_four` text,
	`issuer` text,
	`holder_id` text,
	`status` text DEFAULT 'active',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_corporate_cards_company` ON `corporate_cards` (`company_name`);--> statement-breakpoint
CREATE TABLE `daily_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`closure_id` text,
	`check_number` text NOT NULL,
	`amount` integer NOT NULL,
	`bank_name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`closure_id`) REFERENCES `daily_closures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `daily_closure_items` (
	`id` text PRIMARY KEY NOT NULL,
	`closure_id` text,
	`patient_name` text,
	`amount` integer NOT NULL,
	`payment_method` text,
	`receipt_type` text,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`closure_id`) REFERENCES `daily_closures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `daily_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`date` text NOT NULL,
	`total_amount` integer DEFAULT 0,
	`petty_cash_start` integer DEFAULT 0,
	`petty_cash_end` integer DEFAULT 0,
	`status` text DEFAULT 'draft',
	`created_by` text,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `delivery_confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_number` text,
	`issue_date` text,
	`supplier_name` text,
	`supplier_rep` text,
	`receiver_company` text,
	`receiver_rep` text,
	`delivery_date` text,
	`notes` text,
	`items` text DEFAULT '[]',
	`total_amount` real DEFAULT 0,
	`created_by` text,
	`created_by_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_delivery_confirmations_created_at` ON `delivery_confirmations` (`created_at`);--> statement-breakpoint
CREATE TABLE `department_private_inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`company_id` text,
	`department` text NOT NULL,
	`item_name` text NOT NULL,
	`category` text,
	`unit` text DEFAULT 'EA',
	`quantity` integer DEFAULT 0,
	`min_quantity` integer DEFAULT 0,
	`total_used` integer DEFAULT 0,
	`memo` text,
	`created_by` text,
	`created_by_name` text,
	`updated_by` text,
	`updated_by_name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`updated_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `department_private_inventory_unique_item` ON `department_private_inventory_items` (``);--> statement-breakpoint
CREATE INDEX `department_private_inventory_scope_idx` ON `department_private_inventory_items` (`company_id`,`department`,`item_name`);--> statement-breakpoint
CREATE TABLE `department_private_inventory_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`company` text NOT NULL,
	`company_id` text,
	`department` text NOT NULL,
	`item_name` text NOT NULL,
	`action` text DEFAULT 'consume',
	`quantity` integer DEFAULT 0,
	`prev_quantity` integer,
	`next_quantity` integer,
	`actor_id` text,
	`actor_name` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`item_id`) REFERENCES `department_private_inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `department_private_inventory_logs_scope_idx` ON `department_private_inventory_logs` (`company_id`,`department`,`created_at`);--> statement-breakpoint
CREATE INDEX `department_private_inventory_logs_item_idx` ON `department_private_inventory_logs` (`item_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `device_inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text,
	`device_name` text,
	`inspected_at` text DEFAULT (CURRENT_TIMESTAMP),
	`inspector` text,
	`result` text,
	`notes` text,
	`next_inspection_date` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`device_id`) REFERENCES `medical_devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `discharge_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_name` text NOT NULL,
	`department` text NOT NULL,
	`admission_date` text NOT NULL,
	`discharge_date` text NOT NULL,
	`diagnosis` text DEFAULT '',
	`items` text DEFAULT '[]',
	`status` text DEFAULT 'pending',
	`reviewer_name` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`ai_analysis` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`chart_data` text DEFAULT '',
	`template_id` text DEFAULT '',
	`birth_date` text DEFAULT '',
	`gender` text DEFAULT '',
	`insurance_type` text DEFAULT '',
	`surgery_name` text DEFAULT '',
	`surgery_date` text DEFAULT '',
	`room_grade` text DEFAULT '',
	`doctor_name` text DEFAULT '',
	`comorbidities` text DEFAULT '',
	`admission_route` text DEFAULT '',
	`discharge_type` text DEFAULT '',
	`drg_code` text DEFAULT '',
	`disease_codes` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `discharge_templates` (
	`id` text PRIMARY KEY DEFAULT 'default',
	`items` text DEFAULT '[]',
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`title` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `document_repository` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`content` text,
	`file_url` text,
	`version` integer DEFAULT 1,
	`company_name` text DEFAULT '전체',
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_document_repo_company` ON `document_repository` (`company_name`);--> statement-breakpoint
CREATE INDEX `idx_document_repo_category` ON `document_repository` (`category`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`content` text,
	`file_url` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`document_id`) REFERENCES `document_repository`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_document_versions_doc` ON `document_versions` (`document_id`);--> statement-breakpoint
CREATE TABLE `education_records` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`education_name` text NOT NULL,
	`deadline` text,
	`completed_at` text,
	`status` text DEFAULT '대기',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `employment_contracts` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`contract_type` text,
	`status` text DEFAULT '서명대기',
	`base_salary` integer DEFAULT 0,
	`meal_allowance` integer DEFAULT 0,
	`vehicle_allowance` integer DEFAULT 0,
	`childcare_allowance` integer DEFAULT 0,
	`position_allowance` integer DEFAULT 0,
	`research_allowance` integer DEFAULT 0,
	`other_taxfree` integer DEFAULT 0,
	`effective_date` text,
	`probation_months` integer DEFAULT 3,
	`probation_percent` integer DEFAULT 90,
	`payment_day` integer DEFAULT 7,
	`content` text,
	`working_hours_per_week` real DEFAULT 40,
	`working_days_per_week` integer DEFAULT 5,
	`shift_start_time` text DEFAULT '09:00:00',
	`shift_end_time` text DEFAULT '18:00:00',
	`break_start_time` text DEFAULT '12:00:00',
	`break_end_time` text DEFAULT '13:00:00',
	`signature_data` text,
	`requested_at` text DEFAULT (CURRENT_TIMESTAMP),
	`signed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`start_date` text,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_contracts_staff_id` ON `employment_contracts` (`staff_id`);--> statement-breakpoint
CREATE TABLE `freelancer_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`year_month` text NOT NULL,
	`vendor_name` text NOT NULL,
	`work_type` text,
	`payment_date` text NOT NULL,
	`supply_amount` integer DEFAULT 0,
	`tax_rate` real DEFAULT 3.3,
	`withholding_tax` integer DEFAULT 0,
	`note` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_freelancer_payments_company_month` ON `freelancer_payments` (`company_name`,`year_month`,`payment_date`);--> statement-breakpoint
CREATE TABLE `generated_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text,
	`report_type` text NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'completed',
	`summary` text DEFAULT '{}',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_generated_reports_type_period` ON `generated_reports` (`report_type`,`period`);--> statement-breakpoint
CREATE INDEX `idx_generated_reports_schedule_created` ON `generated_reports` (`schedule_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `handover_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`author_id` text NOT NULL,
	`author_name` text NOT NULL,
	`shift` text NOT NULL,
	`priority` text DEFAULT 'Normal',
	`is_completed` integer DEFAULT 0,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `health_checkups` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`staff_name` text,
	`company` text,
	`department` text,
	`checkup_type` text,
	`scheduled_date` text,
	`completed_date` text,
	`status` text DEFAULT '예정',
	`hospital` text,
	`result` text,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `incident_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_date` text,
	`incident_time` text,
	`location` text,
	`type` text,
	`severity` text,
	`description` text,
	`involved_persons` text,
	`immediate_action` text,
	`root_cause` text,
	`preventive_measures` text,
	`reporter_id` text,
	`reporter_name` text,
	`status` text DEFAULT '보고완료',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `insurance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`staff_name` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`type` text DEFAULT '' NOT NULL,
	`insurance_type` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`effective_date` text DEFAULT (CURRENT_DATE) NOT NULL,
	`reported_at` text,
	`status` text DEFAULT '' NOT NULL,
	`resident_no` text,
	`memo` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_insurance_records_created_at` ON `insurance_records` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_insurance_records_company_status` ON `insurance_records` (`company`,`status`);--> statement-breakpoint
CREATE INDEX `idx_insurance_records_staff` ON `insurance_records` (`staff_id`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`company` text,
	`category` text DEFAULT '일반',
	`item_name` text NOT NULL,
	`quantity` integer DEFAULT 0,
	`min_quantity` integer DEFAULT 5,
	`unit_price` integer DEFAULT 0,
	`expiry_date` text,
	`lot_number` text,
	`is_udi` integer DEFAULT 0,
	`udi_code` text,
	`location` text,
	`supplier_id` text,
	`last_updated` text DEFAULT (CURRENT_TIMESTAMP),
	`stock` integer DEFAULT 0,
	`supplier_name` text,
	`insurance_code` text,
	`spec` text,
	`department` text,
	`safety_stock` integer DEFAULT 0,
	`supplier` text,
	`barcode` text,
	`expiration_date` text,
	`price` integer DEFAULT 0,
	`serial_number` text,
	`name` text,
	`min_stock` integer DEFAULT 10,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_lot_number` ON `inventory` (`lot_number`);--> statement-breakpoint
CREATE INDEX `idx_inventory_location` ON `inventory` (`location`);--> statement-breakpoint
CREATE INDEX `idx_inventory_company_id_item_name` ON `inventory` (`company_id`,`item_name`);--> statement-breakpoint
CREATE INDEX `idx_inventory_company_id` ON `inventory` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_company_department` ON `inventory` (`company_id`,`department`);--> statement-breakpoint
CREATE TABLE `inventory_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`description` text,
	`color` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`parent_id`) REFERENCES `inventory_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_categories_parent_name` ON `inventory_categories` (``);--> statement-breakpoint
CREATE INDEX `idx_inventory_categories_parent_id` ON `inventory_categories` (`parent_id`);--> statement-breakpoint
CREATE TABLE `inventory_closing_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`closing_month` text NOT NULL,
	`snapshot_date` text,
	`company` text,
	`company_id` text,
	`status` text DEFAULT 'locked',
	`item_count` integer DEFAULT 0,
	`total_quantity` real DEFAULT 0,
	`total_value` real DEFAULT 0,
	`summary` text DEFAULT '{}',
	`items` text DEFAULT '[]',
	`created_by_id` text,
	`created_by_name` text,
	`closed_at` text DEFAULT (CURRENT_TIMESTAMP),
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`created_by_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_closing_snapshots_company_month` ON `inventory_closing_snapshots` (`company`,`closing_month`);--> statement-breakpoint
CREATE TABLE `inventory_cost_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text,
	`approval_id` text,
	`inventory_item_id` text,
	`order_item_index` integer DEFAULT 0,
	`item_name` text NOT NULL,
	`company_id` text,
	`company_name` text,
	`department` text,
	`supplier_id` text,
	`supplier_name` text,
	`qty_ordered` real DEFAULT 0,
	`qty_received` real DEFAULT 0,
	`qty_rejected` real DEFAULT 0,
	`qty_pending` real DEFAULT 0,
	`unit_price` real DEFAULT 0,
	`supply_amount` real DEFAULT 0,
	`vat_amount` real DEFAULT 0,
	`total_amount` real DEFAULT 0,
	`cost_center` text,
	`budget_item` text,
	`account_code` text,
	`posted_status` text DEFAULT 'posted',
	`occurred_at` text DEFAULT (CURRENT_TIMESTAMP),
	`posted_at` text,
	`posted_by_id` text,
	`posted_by_name` text,
	`idempotency_key` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`posted_by_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approval_id`) REFERENCES `approvals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_cost_entries_purchase_order` ON `inventory_cost_entries` (`purchase_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_inventory_cost_entries_idempotency_key` ON `inventory_cost_entries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_inventory_cost_entries_company_month` ON `inventory_cost_entries` (`company_name`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `inventory_count_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`conducted_by` text,
	`conducted_name` text,
	`total_items` integer DEFAULT 0,
	`discrepancy_count` integer DEFAULT 0,
	`report` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`company` text,
	`company_id` text,
	`department` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_count_sessions_scope_created_at` ON `inventory_count_sessions` (`company_id`,`department`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_inventory_count_sessions_created_at` ON `inventory_count_sessions` (`created_at`);--> statement-breakpoint
CREATE TABLE `inventory_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text,
	`type` text,
	`quantity` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`inventory_id` text,
	`change_type` text,
	`prev_quantity` integer,
	`next_quantity` integer,
	`actor_name` text,
	`company` text,
	`company_id` text,
	`department` text,
	`notes` text,
	`actor_id` text,
	`approval_id` text,
	`purchase_order_id` text,
	`serial_number` text,
	`lot_number` text,
	`expiry_date` text,
	`location` text,
	`unit_price` real,
	`supplier_name` text,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approval_id`) REFERENCES `approvals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_logs_scope_created_at` ON `inventory_logs` (`company_id`,`department`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_inventory_logs_purchase_order_id` ON `inventory_logs` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_logs_lot_number` ON `inventory_logs` (`lot_number`);--> statement-breakpoint
CREATE INDEX `idx_inventory_logs_company_id_created_at` ON `inventory_logs` (`company_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_inventory_logs_company_department_created_at` ON `inventory_logs` (`company_id`,`department`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_inventory_logs_approval_id` ON `inventory_logs` (`approval_id`);--> statement-breakpoint
CREATE TABLE `inventory_price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_item_id` text NOT NULL,
	`supplier_id` text,
	`supplier_name` text,
	`unit_price` real DEFAULT 0,
	`quantity` integer DEFAULT 0,
	`total_amount` real DEFAULT 0,
	`source_type` text DEFAULT 'manual',
	`recorded_at` text DEFAULT (CURRENT_TIMESTAMP),
	`recorded_by` text,
	`purchase_order_id` text,
	`notes` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recorded_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_price_history_purchase_order_id` ON `inventory_price_history` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_price_history_item_recorded_at` ON `inventory_price_history` (`inventory_item_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `inventory_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text,
	`qty` integer NOT NULL,
	`unit_price` real,
	`supplier_id` text,
	`receipt_date` text DEFAULT (CURRENT_TIMESTAMP),
	`receipt_type` text DEFAULT '수동',
	`lot_number` text,
	`expiry_date` text,
	`invoice_number` text,
	`notes` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`item_id`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `inventory_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text,
	`item_name` text,
	`quantity` integer DEFAULT 0,
	`from_company` text,
	`from_department` text,
	`to_company` text,
	`to_department` text,
	`reason` text,
	`transferred_by` text,
	`transferred_by_id` text,
	`status` text DEFAULT '완료',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`approval_id` text,
	`purchase_order_id` text,
	`serial_number` text,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approval_id`) REFERENCES `approvals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_inventory_transfers_purchase_order_id` ON `inventory_transfers` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `idx_inventory_transfers_created_at` ON `inventory_transfers` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_inventory_transfers_approval_id` ON `inventory_transfers` (`approval_id`);--> statement-breakpoint
CREATE TABLE `job_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`is_medical_staff` integer DEFAULT 1,
	`display_order` integer DEFAULT 0,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `job_category_required_trainings` (
	`id` text PRIMARY KEY NOT NULL,
	`job_category_id` text,
	`applies_to_all` integer DEFAULT 0,
	`training_code` text NOT NULL,
	`training_name` text NOT NULL,
	`cycle_months` integer,
	`mandatory` integer DEFAULT 1,
	`obligation_type` text DEFAULT 'legal',
	`legal_basis` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`job_category_id`) REFERENCES `job_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_jcrt_job_category_id` ON `job_category_required_trainings` (`job_category_id`);--> statement-breakpoint
CREATE INDEX `idx_jcrt_applies_to_all` ON `job_category_required_trainings` (`applies_to_all`);--> statement-breakpoint
CREATE TABLE `leave_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`year` integer NOT NULL,
	`total_days` real DEFAULT 0,
	`used_days` real DEFAULT 0,
	`remaining_days` real DEFAULT 0,
	`expiry_date` text,
	`expired_days` real DEFAULT 0,
	`expired_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`compensated_days` real DEFAULT 0,
	`compensated_at` text,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_leave_balances_staff_id` ON `leave_balances` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_leave_balances_expiry_date` ON `leave_balances` (`expiry_date`);--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`leave_type` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`reason` text,
	`status` text DEFAULT '대기',
	`approved_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`company_id` text,
	`days` real,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_leave_requests_staff_id` ON `leave_requests` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_leave_requests_company_id` ON `leave_requests` (`company_id`);--> statement-breakpoint
CREATE TABLE `license_continuing_education` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`license_id` text,
	`license_type_hint` text,
	`license_name_hint` text,
	`file_url` text NOT NULL,
	`file_name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_at` text DEFAULT (CURRENT_TIMESTAMP),
	`submitted_by` text,
	`ocr_text` text,
	`ocr_education_date` text,
	`ocr_extracted_meta` text,
	`education_date` text,
	`applied_expiry_date` text,
	`applied_renewed_date` text,
	`reject_reason` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`reviewed_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`submitted_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`license_id`) REFERENCES `staff_licenses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_license_ce_submitted_at` ON `license_continuing_education` (`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_license_ce_status` ON `license_continuing_education` (`status`);--> statement-breakpoint
CREATE INDEX `idx_license_ce_license_id` ON `license_continuing_education` (`license_id`);--> statement-breakpoint
CREATE INDEX `idx_license_ce_staff_id` ON `license_continuing_education` (`staff_id`);--> statement-breakpoint
CREATE TABLE `login_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`user_name` text,
	`action` text,
	`ip_address` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `medical_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model` text,
	`serial` text,
	`category` text,
	`location` text,
	`cycle` integer DEFAULT 12,
	`next_inspection_date` text,
	`last_inspection_date` text,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `meeting_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`room` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`booker_id` text,
	`booker_name` text,
	`status` text DEFAULT '예약',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`booker_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `message_bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`message_id` text NOT NULL,
	`room_id` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_message_bookmarks_user_message` ON `message_bookmarks` (`user_id`,`message_id`);--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text DEFAULT '👍',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_message_reactions_msg` ON `message_reactions` (`message_id`);--> statement-breakpoint
CREATE TABLE `message_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text,
	`reader_id` text,
	`read_at` text DEFAULT (CURRENT_TIMESTAMP),
	`user_id` text,
	FOREIGN KEY (`reader_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`sender_id` text,
	`content` text,
	`file_url` text,
	`reply_to_id` text,
	`is_deleted` integer DEFAULT 0,
	`edited_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`file_size_bytes` integer,
	`file_kind` text,
	`file_name` text,
	`album_id` text,
	`album_index` integer,
	`album_total` integer,
	`message_type` text DEFAULT 'text',
	`sender_name` text,
	FOREIGN KEY (`reply_to_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_messages_sender` ON `messages` (`sender_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_room_unread_count` ON `messages` (`room_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_messages_room_created_id_desc` ON `messages` (`room_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_messages_room` ON `messages` (`room_id`);--> statement-breakpoint
CREATE TABLE `messenger_drive_links` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체',
	`room_id` text,
	`name` text NOT NULL,
	`url` text DEFAULT '',
	`sort_order` integer DEFAULT 0,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`updated_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_messenger_drive_links_room` ON `messenger_drive_links` (`room_id`);--> statement-breakpoint
CREATE INDEX `idx_messenger_drive_links_company` ON `messenger_drive_links` (`company_name`,`sort_order`,`created_at`);--> statement-breakpoint
CREATE TABLE `monthly_off_quota` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`year_month` text NOT NULL,
	`default_off_days` integer DEFAULT 8,
	`staff_overrides` text DEFAULT '{}',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_monthly_off_quota_year_month` ON `monthly_off_quota` (`year_month`);--> statement-breakpoint
CREATE INDEX `idx_monthly_off_quota_company` ON `monthly_off_quota` (`company`);--> statement-breakpoint
CREATE TABLE `mri_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`is_active` integer DEFAULT 1,
	`body_part` text
);
--> statement-breakpoint
CREATE TABLE `notification_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`template_type` text NOT NULL,
	`name` text NOT NULL,
	`content` text NOT NULL,
	`variables` text DEFAULT '[]',
	`is_active` integer DEFAULT 1,
	`company_name` text DEFAULT '전체',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text,
	`title` text,
	`body` text,
	`metadata` text,
	`read_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`user_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_id` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE TABLE `official_doc_log` (
	`id` integer PRIMARY KEY NOT NULL,
	`sent_date` text NOT NULL,
	`doc_number` text DEFAULT '',
	`title` text DEFAULT '',
	`recipient` text DEFAULT '',
	`manager` text DEFAULT '',
	`is_received` integer DEFAULT 0,
	`note` text DEFAULT '',
	`company` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_official_doc_log_sent_date` ON `official_doc_log` (`sent_date`);--> statement-breakpoint
CREATE INDEX `idx_official_doc_log_company` ON `official_doc_log` (`company`);--> statement-breakpoint
CREATE TABLE `onboarding_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`checklist_type` text NOT NULL,
	`items` text DEFAULT '[]',
	`target_date` text,
	`completed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_onboarding_staff` ON `onboarding_checklists` (`staff_id`);--> statement-breakpoint
CREATE TABLE `op_check_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`company_name` text DEFAULT '전체',
	`template_scope` text DEFAULT 'surgery',
	`template_name` text NOT NULL,
	`surgery_template_id` text,
	`surgery_name` text,
	`anesthesia_type` text,
	`prep_items` text DEFAULT '[]',
	`consumable_items` text DEFAULT '[]',
	`notes` text,
	`is_active` integer DEFAULT 1,
	`created_by` text,
	`created_by_name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_op_check_templates_surgery_name` ON `op_check_templates` (``);--> statement-breakpoint
CREATE INDEX `idx_op_check_templates_company_scope` ON `op_check_templates` (`company_id`,`template_scope`,`is_active`);--> statement-breakpoint
CREATE INDEX `idx_op_check_templates_anesthesia` ON `op_check_templates` (``);--> statement-breakpoint
CREATE TABLE `op_patient_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_post_id` text NOT NULL,
	`company_id` text,
	`company_name` text DEFAULT '전체',
	`patient_name` text DEFAULT '',
	`chart_no` text,
	`surgery_name` text DEFAULT '',
	`surgery_template_id` text,
	`anesthesia_type` text,
	`schedule_date` text,
	`schedule_time` text,
	`schedule_room` text,
	`prep_items` text DEFAULT '[]',
	`consumable_items` text DEFAULT '[]',
	`notes` text,
	`status` text DEFAULT '준비중',
	`applied_template_ids` text DEFAULT '{}',
	`created_by` text,
	`created_by_name` text,
	`updated_by` text,
	`updated_by_name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`surgery_started_at` text,
	`surgery_ended_at` text,
	`ward_message_sent_at` text,
	FOREIGN KEY (`updated_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_op_patient_checks_patient_name` ON `op_patient_checks` (``);--> statement-breakpoint
CREATE INDEX `idx_op_patient_checks_company_date` ON `op_patient_checks` (`company_id`,`schedule_date`,`updated_at`);--> statement-breakpoint
CREATE TABLE `org_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체',
	`division` text NOT NULL,
	`team_name` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `payroll` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`staff_id` text,
	`month` text NOT NULL,
	`base_salary` real NOT NULL,
	`total_salary` real NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `payroll_approval_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체',
	`year_month` text NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`comment` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`actor_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_approval_logs_scope` ON `payroll_approval_logs` (`company_name`,`year_month`,`created_at`);--> statement-breakpoint
CREATE TABLE `payroll_approval_workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체',
	`year_month` text NOT NULL,
	`step1_status` text DEFAULT '대기',
	`step2_status` text DEFAULT '대기',
	`step1_comment` text,
	`step2_comment` text,
	`step1_actor_id` text,
	`step2_actor_id` text,
	`step1_updated_at` text,
	`step2_updated_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`step2_actor_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`step1_actor_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_approval_workflows_scope` ON `payroll_approval_workflows` (`company_name`,`year_month`);--> statement-breakpoint
CREATE TABLE `payroll_bonus_items` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`company_name` text NOT NULL,
	`year_month` text NOT NULL,
	`category` text DEFAULT '상여',
	`amount` integer DEFAULT 0,
	`note` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_bonus_items_staff` ON `payroll_bonus_items` (`staff_id`,`year_month`);--> statement-breakpoint
CREATE INDEX `idx_payroll_bonus_items_company_month` ON `payroll_bonus_items` (`company_name`,`year_month`,`created_at`);--> statement-breakpoint
CREATE TABLE `payroll_calendar_items` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체',
	`year_month` text NOT NULL,
	`title` text NOT NULL,
	`due_date` text NOT NULL,
	`owner_label` text NOT NULL,
	`status` text DEFAULT '대기',
	`sort_order` integer DEFAULT 0,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`updated_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_calendar_items_scope` ON `payroll_calendar_items` (`company_name`,`year_month`,`sort_order`);--> statement-breakpoint
CREATE TABLE `payroll_deduction_controls` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`company_name` text NOT NULL,
	`deduction_type` text NOT NULL,
	`monthly_amount` integer DEFAULT 0,
	`balance` integer DEFAULT 0,
	`note` text,
	`is_active` integer DEFAULT 1,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_deduction_controls_staff` ON `payroll_deduction_controls` (`staff_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `idx_payroll_deduction_controls_company` ON `payroll_deduction_controls` (`company_name`,`is_active`,`created_at`);--> statement-breakpoint
CREATE TABLE `payroll_locks` (
	`id` text PRIMARY KEY NOT NULL,
	`year_month` text NOT NULL,
	`company_name` text DEFAULT '전체',
	`locked_at` text DEFAULT (CURRENT_TIMESTAMP),
	`locked_by` text,
	`memo` text,
	`reopen_requested_at` text,
	`reopen_requested_by` text,
	`reopen_request_comment` text,
	`reopen_request_status` text,
	`reopen_reviewed_at` text,
	`reopen_reviewed_by` text,
	`reopen_review_comment` text,
	FOREIGN KEY (`reopen_reviewed_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reopen_requested_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_locks_reopen_status` ON `payroll_locks` (`year_month`,`company_name`,`reopen_request_status`);--> statement-breakpoint
CREATE TABLE `payroll_policy_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체',
	`effective_year` integer NOT NULL,
	`version_label` text NOT NULL,
	`snapshot` text DEFAULT '{}',
	`note` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_policy_versions_scope` ON `payroll_policy_versions` (`company_name`,`effective_year`,`created_at`);--> statement-breakpoint
CREATE TABLE `payroll_records` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`year_month` text NOT NULL,
	`base_salary` integer DEFAULT 0,
	`meal_allowance` integer DEFAULT 0,
	`vehicle_allowance` integer DEFAULT 0,
	`childcare_allowance` integer DEFAULT 0,
	`research_allowance` integer DEFAULT 0,
	`other_taxfree` integer DEFAULT 0,
	`extra_allowance` integer DEFAULT 0,
	`overtime_pay` integer DEFAULT 0,
	`bonus` integer DEFAULT 0,
	`total_taxable` integer DEFAULT 0,
	`total_taxfree` integer DEFAULT 0,
	`total_deduction` integer DEFAULT 0,
	`net_pay` integer DEFAULT 0,
	`attendance_deduction` integer DEFAULT 0,
	`attendance_deduction_detail` text,
	`status` text DEFAULT '임시',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`record_type` text DEFAULT 'regular',
	`severance_pay` integer DEFAULT 0,
	`settlement_reason` text,
	`settlement_date` text,
	`advance_pay` integer DEFAULT 0,
	`deduction_detail` text DEFAULT '{}',
	`night_duty_allowance` integer DEFAULT 0,
	`gross_pay` real DEFAULT 0,
	`national_pension` real DEFAULT 0,
	`health_insurance` real DEFAULT 0,
	`long_term_care` real DEFAULT 0,
	`employment_insurance` real DEFAULT 0,
	`income_tax` real DEFAULT 0,
	`local_tax` real DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_records_staff_ym` ON `payroll_records` (`staff_id`,`year_month`);--> statement-breakpoint
CREATE TABLE `payroll_retro_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`company_name` text NOT NULL,
	`start_month` text NOT NULL,
	`end_month` text NOT NULL,
	`before_base` integer DEFAULT 0,
	`after_base` integer DEFAULT 0,
	`retro_total` integer DEFAULT 0,
	`reason` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_retro_adjustments_staff` ON `payroll_retro_adjustments` (`staff_id`,`start_month`,`end_month`);--> statement-breakpoint
CREATE INDEX `idx_payroll_retro_adjustments_company` ON `payroll_retro_adjustments` (`company_name`,`created_at`);--> statement-breakpoint
CREATE TABLE `personnel_appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`staff_name` text,
	`company` text,
	`order_type` text,
	`effective_date` text,
	`before_dept` text,
	`after_dept` text,
	`before_position` text,
	`after_position` text,
	`before_role` text,
	`after_role` text,
	`reason` text,
	`memo` text,
	`status` text DEFAULT '발령완료',
	`issued_by` text,
	`issued_at` text DEFAULT (CURRENT_TIMESTAMP),
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`new_department` text
);
--> statement-breakpoint
CREATE TABLE `pinned_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`message_id` text NOT NULL,
	`pinned_by` text,
	`pinned_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_pinned_room` ON `pinned_messages` (`room_id`);--> statement-breakpoint
CREATE TABLE `poll_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`poll_id` text NOT NULL,
	`user_id` text NOT NULL,
	`option_index` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `polls` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`message_id` text,
	`creator_id` text,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_polls_room` ON `polls` (`room_id`);--> statement-breakpoint
CREATE TABLE `popups` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`media_url` text,
	`media_type` text DEFAULT 'image',
	`width` integer DEFAULT 400,
	`height` integer DEFAULT 500,
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`link_url` text,
	`start_at` text,
	`end_at` text,
	`priority` integer DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `idx_popups_schedule_priority` ON `popups` (`is_active`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_popups_active_created` ON `popups` (`is_active`,`created_at`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`board_type` text DEFAULT '공지사항',
	`title` text NOT NULL,
	`content` text,
	`author_id` text,
	`author_name` text,
	`company` text,
	`views` integer DEFAULT 0,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`company_id` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_posts_company_id_created_at` ON `posts` (`company_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`supplier_id` text,
	`items` text NOT NULL,
	`status` text DEFAULT '대기',
	`total_amount` real,
	`notes` text,
	`created_by` text,
	`approved_by` text,
	`approved_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`supplier_name` text,
	`expected_delivery_date` text,
	`ordered_at` text,
	`received_at` text,
	`received_by_id` text,
	`received_by_name` text,
	`inspected_at` text,
	`inspected_by_id` text,
	`inspected_by_name` text,
	`inspection_status` text,
	`received_qty` real DEFAULT 0,
	`rejected_qty` real DEFAULT 0,
	`received_items` text DEFAULT '[]',
	`closed_at` text,
	`closed_by_id` text,
	`closed_by_name` text,
	`expense_status` text DEFAULT 'pending',
	`expense_posted_at` text,
	`expense_posted_by_id` text,
	`expense_posted_by_name` text,
	`expense_total_amount` real DEFAULT 0,
	`tax_amount` real DEFAULT 0,
	`invoice_no` text,
	`invoice_date` text,
	`payment_status` text DEFAULT 'unpaid',
	`payment_due_date` text,
	`cost_center` text,
	`budget_department` text,
	`account_code` text,
	`source_supply_approval_id` text,
	`source_supply_request_index` integer,
	`requester_company` text,
	`requester_department` text,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_supply_approval_id`) REFERENCES `approvals`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`received_by_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`inspected_by_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`expense_posted_by_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`closed_by_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_orders_status` ON `purchase_orders` (`status`);--> statement-breakpoint
CREATE INDEX `idx_purchase_orders_source_supply_approval` ON `purchase_orders` (`source_supply_approval_id`,`source_supply_request_index`);--> statement-breakpoint
CREATE INDEX `idx_purchase_orders_inspection_status` ON `purchase_orders` (`inspection_status`);--> statement-breakpoint
CREATE INDEX `idx_purchase_orders_expense_status` ON `purchase_orders` (`expense_status`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`fcm_token` text,
	`device_id` text,
	`platform` text,
	`user_agent` text
);
--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_staff_id` ON `push_subscriptions` (`staff_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_push_subscriptions_staff_endpoint` ON `push_subscriptions` (`staff_id`,`endpoint`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_push_subscriptions_staff_device_unique` ON `push_subscriptions` (`staff_id`,`device_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_push_subscriptions_fcm_token_unique` ON `push_subscriptions` (`fcm_token`);--> statement-breakpoint
CREATE INDEX `idx_push_subscriptions_fcm_token` ON `push_subscriptions` (`fcm_token`);--> statement-breakpoint
CREATE TABLE `report_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`report_type` text NOT NULL,
	`schedule_cron` text,
	`recipients` text DEFAULT '[]',
	`enabled` integer DEFAULT 1,
	`last_generated_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_report_schedules_enabled` ON `report_schedules` (`enabled`,`report_type`);--> statement-breakpoint
CREATE TABLE `retirement_pensions` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`staff_name` text,
	`pension_type` text DEFAULT 'unregistered',
	`joined_date` text,
	`account_number` text,
	`fund_name` text,
	`monthly_contribution` real DEFAULT 0,
	`total_accumulated` real DEFAULT 0,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_retirement_pensions_type` ON `retirement_pensions` (`pension_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_retirement_pensions_staff_id` ON `retirement_pensions` (`staff_id`);--> statement-breakpoint
CREATE TABLE `reward_discipline` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`staff_name` text,
	`company` text,
	`department` text,
	`category` text,
	`type` text,
	`date` text,
	`reason` text,
	`detail` text,
	`amount` real DEFAULT 0,
	`committee_date` text,
	`committee_members` text,
	`committee_result` text,
	`memo` text,
	`issued_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `room_notification_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`notifications_enabled` integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE `room_read_cursors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`last_read_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_room_read_cursors_room_user` ON `room_read_cursors` (`room_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `roster_approval_requests` (
	`id` numeric PRIMARY KEY DEFAULT '',
	`company_name` text,
	`team_name` text,
	`year_month` text NOT NULL,
	`assignments` text DEFAULT '[]' NOT NULL,
	`requested_by` numeric,
	`requested_by_name` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` numeric,
	`approved_at` text,
	`rejected_by` numeric,
	`rejected_at` text,
	`reject_reason` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`rejected_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requested_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `roster_policy_settings` (
	`id` numeric PRIMARY KEY DEFAULT '',
	`policy_type` text NOT NULL,
	`policy_id` text NOT NULL,
	`company_id` numeric,
	`company_name` text DEFAULT '전체' NOT NULL,
	`name` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_by` numeric,
	`updated_by` numeric,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `roster_swap_requests` (
	`id` numeric PRIMARY KEY DEFAULT '',
	`company_name` text,
	`team_name` text,
	`requested_by` numeric,
	`requested_by_name` text,
	`staff_id` numeric,
	`work_date` numeric NOT NULL,
	`target_date` numeric NOT NULL,
	`current_shift_id` numeric,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` numeric,
	`approved_at` text,
	`rejected_by` numeric,
	`rejected_at` text,
	`reject_reason` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`rejected_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`current_shift_id`) REFERENCES `work_shifts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `salary_change_history` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`change_type` text NOT NULL,
	`before_value` integer,
	`after_value` integer,
	`effective_date` text NOT NULL,
	`reason` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`previous_salary` real
);
--> statement-breakpoint
CREATE INDEX `idx_salary_change_staff_date` ON `salary_change_history` (`staff_id`,`effective_date`);--> statement-breakpoint
CREATE INDEX `idx_salary_change_staff` ON `salary_change_history` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_salary_change_date` ON `salary_change_history` (`effective_date`);--> statement-breakpoint
CREATE TABLE `scheduled_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`content` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`is_sent` integer DEFAULT 0,
	`reply_to_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`room_id`) REFERENCES `chat_rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reply_to_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_scheduled_messages_sender` ON `scheduled_messages` (`sender_id`,`is_sent`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `shift_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`work_date` text NOT NULL,
	`shift_id` text,
	`company_name` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`shift_name` text
);
--> statement-breakpoint
CREATE INDEX `idx_shift_assignments_work_date` ON `shift_assignments` (`work_date`);--> statement-breakpoint
CREATE INDEX `idx_shift_assignments_staff` ON `shift_assignments` (`staff_id`);--> statement-breakpoint
CREATE TABLE `staff_certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`name` text NOT NULL,
	`issuer` text,
	`issue_date` text,
	`expiry_date` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `staff_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`evaluator_id` text,
	`category` text NOT NULL,
	`content` text NOT NULL,
	`score` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evaluator_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_staff_evaluations_staff_id` ON `staff_evaluations` (`staff_id`);--> statement-breakpoint
CREATE TABLE `staff_job_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`job_category_id` text NOT NULL,
	`is_primary` integer DEFAULT 0,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_category_id`) REFERENCES `job_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_staff_job_categories_staff_id` ON `staff_job_categories` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_job_categories_job_category_id` ON `staff_job_categories` (`job_category_id`);--> statement-breakpoint
CREATE TABLE `staff_licenses` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`license_name` text,
	`license_number` text,
	`issued_date` text,
	`expiry_date` text,
	`issuing_body` text,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`license_type` text,
	`is_primary` integer DEFAULT 0,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`renewed_date` text,
	`attachment_url` text,
	`copy_url` text,
	`document_url` text,
	`document_file_url` text,
	`license_file_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_staff_licenses_staff_number` ON `staff_licenses` (`staff_id`,`license_number`);--> statement-breakpoint
CREATE INDEX `idx_staff_licenses_staff_id_is_primary` ON `staff_licenses` (`staff_id`,`is_primary`);--> statement-breakpoint
CREATE INDEX `idx_staff_licenses_staff_id` ON `staff_licenses` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_licenses_expiry_date` ON `staff_licenses` (`expiry_date`);--> statement-breakpoint
CREATE TABLE `staff_members` (
	`id` text PRIMARY KEY NOT NULL,
	`employee_no` text NOT NULL,
	`name` text NOT NULL,
	`company` text NOT NULL,
	`company_id` text,
	`department` text,
	`position` text,
	`team` text,
	`email` text,
	`phone` text,
	`resident_no` text,
	`address` text,
	`license` text,
	`bank_account` text,
	`salary_info` text,
	`join_date` text,
	`joined_at` text,
	`resigned_at` text,
	`status` text DEFAULT '재직',
	`role` text DEFAULT 'user',
	`permissions` text DEFAULT '{}',
	`password` text,
	`annual_leave_total` real DEFAULT 15,
	`annual_leave_used` real DEFAULT 0,
	`shift_id` text,
	`base_salary` integer DEFAULT 0,
	`other_taxfree` integer DEFAULT 0,
	`position_allowance` integer DEFAULT 0,
	`overtime_allowance` integer DEFAULT 0,
	`night_work_allowance` integer DEFAULT 0,
	`holiday_work_allowance` integer DEFAULT 0,
	`annual_leave_pay` integer DEFAULT 0,
	`working_hours_per_week` real DEFAULT 40,
	`working_days_per_week` integer DEFAULT 5,
	`last_seen_at` text,
	`presence_status` text DEFAULT 'away',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`auth_user_id` text,
	`meal_allowance` integer DEFAULT 0,
	`night_duty_allowance` integer DEFAULT 0,
	`vehicle_allowance` integer DEFAULT 0,
	`childcare_allowance` integer DEFAULT 0,
	`research_allowance` integer DEFAULT 0,
	`birth_date` text,
	`is_system_master` integer DEFAULT 0,
	`avatar_url` text,
	`photo_url` text,
	`profile_photo_path` text,
	`profile_photo_updated_at` text,
	`force_logout_at` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`hire_date` text,
	`resign_date` text,
	`bank_name` text,
	`passwd` text,
	`employment_type` text,
	`staff_email` text,
	`annual_days` real,
	`annual_used` real,
	`gender` text,
	`salary` real,
	`extension` text,
	`contract_type` text,
	FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_staff_members_shift_id` ON `staff_members` (`shift_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_members_company_id` ON `staff_members` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_staff_members_auth_user_id` ON `staff_members` (`auth_user_id`);--> statement-breakpoint
CREATE TABLE `staff_preferred_off` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`year_month` text NOT NULL,
	`preferred_weekdays` text DEFAULT '{}',
	`preferred_dates` text DEFAULT '{}',
	`notes` text DEFAULT '',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_staff_preferred_off_year_month` ON `staff_preferred_off` (`year_month`);--> statement-breakpoint
CREATE INDEX `idx_staff_preferred_off_staff_id` ON `staff_preferred_off` (`staff_id`);--> statement-breakpoint
CREATE TABLE `staff_shift_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`shift_id` text NOT NULL,
	`is_primary` integer DEFAULT 0,
	`priority` integer DEFAULT 0,
	`effective_from` text,
	`effective_to` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_staff_shift_assignments_staff_id_is_primary` ON `staff_shift_assignments` (`staff_id`,`is_primary`);--> statement-breakpoint
CREATE INDEX `idx_staff_shift_assignments_staff_id` ON `staff_shift_assignments` (`staff_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_shift_assignments_shift_id` ON `staff_shift_assignments` (`shift_id`);--> statement-breakpoint
CREATE TABLE `staff_trainings` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`training_code` text NOT NULL,
	`training_name` text NOT NULL,
	`assigned_at` text DEFAULT (CURRENT_TIMESTAMP),
	`mandatory` integer DEFAULT 1,
	`obligation_type` text DEFAULT 'legal',
	`cycle_months` integer,
	`status` text DEFAULT '미이수',
	`completed_at` text,
	`certificate_url` text,
	`memo` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_staff_trainings_training_code` ON `staff_trainings` (`training_code`);--> statement-breakpoint
CREATE INDEX `idx_staff_trainings_status` ON `staff_trainings` (`status`);--> statement-breakpoint
CREATE INDEX `idx_staff_trainings_staff_id` ON `staff_trainings` (`staff_id`);--> statement-breakpoint
CREATE TABLE `staff_transfer_history` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text,
	`transfer_type` text,
	`before_value` text,
	`after_value` text,
	`effective_date` text,
	`approval_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`staff_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approval_id`) REFERENCES `approvals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text,
	`phone` text,
	`address` text,
	`email` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	`contact_name` text,
	`business_number` text,
	`category` text,
	`contract_start` text,
	`contract_end` text,
	`payment_terms` text,
	`notes` text,
	`created_by` text
);
--> statement-breakpoint
CREATE TABLE `surgery_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`is_active` integer DEFAULT 1,
	`body_part` text
);
--> statement-breakpoint
CREATE TABLE `system_configs` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`description` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`status` text DEFAULT 'todo',
	`priority` text DEFAULT 'medium',
	`assignee_id` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `tax_free_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text DEFAULT '전체',
	`meal_limit` integer DEFAULT 200000,
	`vehicle_limit` integer DEFAULT 200000,
	`childcare_limit` integer DEFAULT 100000,
	`research_limit` integer DEFAULT 200000,
	`uniform_limit` integer DEFAULT 300000,
	`congratulations_limit` integer DEFAULT 500000,
	`housing_limit` integer DEFAULT 700000,
	`other_taxfree_limit` integer DEFAULT 0,
	`effective_year` integer DEFAULT 2025,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `tax_insurance_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`effective_year` integer NOT NULL,
	`company_name` text DEFAULT '전체',
	`national_pension_rate` real DEFAULT 0.045,
	`health_insurance_rate` real DEFAULT 0.03545,
	`long_term_care_rate` real DEFAULT 0.00459,
	`employment_insurance_rate` real DEFAULT 0.009,
	`income_tax_bracket` text DEFAULT '[]',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `tax_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`year` text NOT NULL,
	`company_name` text,
	`report_type` text NOT NULL,
	`report_date` text,
	`data` text DEFAULT '[]',
	`status` text DEFAULT 'draft',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_tax_reports_year_company` ON `tax_reports` (`year`,`company_name`,`report_type`);--> statement-breakpoint
CREATE TABLE `todo_reminder_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reminder_at` text NOT NULL,
	`notification_id` text,
	`status` text DEFAULT 'sent',
	`title` text,
	`body` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`user_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_todo_reminder_logs_unique` ON `todo_reminder_logs` (`user_id`,`todo_id`,`reminder_at`);--> statement-breakpoint
CREATE INDEX `idx_todo_reminder_logs_created` ON `todo_reminder_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`is_complete` integer DEFAULT 0,
	`task_date` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`source_message_id` text,
	`source_room_id` text,
	`repeat_parent_id` text,
	`repeat_generated_from_id` text,
	`priority` text DEFAULT 'medium',
	`reminder_at` text,
	`repeat_type` text DEFAULT 'none',
	`assignee_kind` text DEFAULT 'self'
);
--> statement-breakpoint
CREATE INDEX `idx_todos_user_date` ON `todos` (`user_id`,`task_date`);--> statement-breakpoint
CREATE INDEX `idx_todos_source_message` ON `todos` (`user_id`,`source_room_id`,`source_message_id`);--> statement-breakpoint
CREATE INDEX `idx_todos_repeat_parent_date` ON `todos` (`user_id`,`repeat_parent_id`,`task_date`);--> statement-breakpoint
CREATE INDEX `idx_todos_reminder_at` ON `todos` (`reminder_at`);--> statement-breakpoint
CREATE INDEX `idx_todos_priority_date` ON `todos` (`user_id`,`priority`,`task_date`);--> statement-breakpoint
CREATE TABLE `unpaid_absence_records` (
	`id` text PRIMARY KEY NOT NULL,
	`staff_id` text NOT NULL,
	`staff_name` text,
	`year_month` text NOT NULL,
	`absent_days` real DEFAULT 0,
	`monthly_salary` integer DEFAULT 0,
	`working_days` integer DEFAULT 0,
	`daily_wage` real DEFAULT 0,
	`deduction_amount` integer DEFAULT 0,
	`note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE TABLE `virtual_account_deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`provider` text DEFAULT 'generic',
	`dedupe_key` text NOT NULL,
	`provider_event_type` text,
	`provider_event_id` text,
	`order_id` text,
	`order_name` text,
	`payment_key` text,
	`transaction_key` text,
	`method` text,
	`deposit_status` text DEFAULT 'issued',
	`match_status` text DEFAULT 'unmatched',
	`amount` real DEFAULT 0,
	`currency` text DEFAULT 'KRW',
	`depositor_name` text,
	`customer_name` text,
	`patient_name` text,
	`patient_id` text,
	`transaction_label` text,
	`bank_code` text,
	`bank_name` text,
	`account_number` text,
	`due_date` text,
	`deposited_at` text,
	`matched_target_type` text,
	`matched_target_id` text,
	`matched_note` text,
	`raw_payload` text DEFAULT '{}',
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP)
);
--> statement-breakpoint
CREATE INDEX `idx_virtual_account_deposits_status` ON `virtual_account_deposits` (`deposit_status`,`match_status`);--> statement-breakpoint
CREATE INDEX `idx_virtual_account_deposits_deposited_at` ON `virtual_account_deposits` (`deposited_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_virtual_account_deposits_dedupe_key` ON `virtual_account_deposits` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_virtual_account_deposits_company_created_at` ON `virtual_account_deposits` (`company_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wiki_document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`content` text DEFAULT '',
	`tags` text DEFAULT '{}',
	`editor_ids` text DEFAULT '{}',
	`company_id` text,
	`company_name` text DEFAULT '전체',
	`change_summary` text,
	`restore_of_version_id` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`restore_of_version_id`) REFERENCES `wiki_document_versions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`document_id`) REFERENCES `wiki_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_wiki_document_versions_document_created` ON `wiki_document_versions` (`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wiki_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`company_id` text,
	`company_name` text DEFAULT '전체',
	`title` text NOT NULL,
	`summary` text,
	`content` text DEFAULT '',
	`tags` text DEFAULT '{}',
	`editor_ids` text DEFAULT '{}',
	`is_published` integer DEFAULT 1,
	`is_archived` integer DEFAULT 0,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`updated_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`folder_id`) REFERENCES `wiki_folders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_wiki_documents_folder_updated` ON `wiki_documents` (`folder_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_wiki_documents_company_title` ON `wiki_documents` (`company_id`,`title`);--> statement-breakpoint
CREATE TABLE `wiki_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`company_name` text DEFAULT '전체',
	`name` text NOT NULL,
	`description` text,
	`color` text,
	`sort_order` integer DEFAULT 0,
	`is_archived` integer DEFAULT 0,
	`created_by` text,
	`updated_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP),
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP),
	FOREIGN KEY (`updated_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_wiki_folders_company_sort` ON `wiki_folders` (`company_id`,`sort_order`,`created_at`);--> statement-breakpoint
CREATE TABLE `work_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`break_start_time` text,
	`break_end_time` text,
	`description` text,
	`company_name` text,
	`shift_type` text,
	`weekly_work_days` integer DEFAULT 5,
	`is_weekend_work` integer DEFAULT 0,
	`is_shift` integer DEFAULT 0,
	`is_active` integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);

*/