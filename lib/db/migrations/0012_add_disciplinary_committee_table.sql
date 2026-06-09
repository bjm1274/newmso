CREATE TABLE `disciplinary_committees` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text,
	`title` text NOT NULL,
	`meeting_date` text,
	`target_staff_id` text NOT NULL,
	`target_staff_name` text NOT NULL,
	`status` text DEFAULT '대기',
	`reason` text NOT NULL,
	`result_type` text,
	`result_details` text,
	`committee_members` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP)
);
