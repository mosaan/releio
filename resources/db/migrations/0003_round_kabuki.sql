CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`state` text DEFAULT 'completed' NOT NULL,
	`sequence` integer NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`error` text,
	`metadata` text,
	`parent_message_id` text,
	`deleted_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_message_at` integer,
	`archived_at` integer,
	`pinned_at` integer,
	`provider_config_id` text,
	`model_id` text,
	`message_count` integer DEFAULT 0 NOT NULL,
	`data_schema_version` integer DEFAULT 1 NOT NULL,
	`summary` text,
	`summary_updated_at` integer,
	`color` text,
	`metadata` text
);
--> statement-breakpoint
CREATE TABLE `message_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`sequence` integer NOT NULL,
	`content_text` text,
	`content_json` text,
	`mime_type` text,
	`size_bytes` integer,
	`tool_call_id` text,
	`tool_name` text,
	`status` text,
	`error_code` text,
	`error_message` text,
	`related_part_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_part_id`) REFERENCES `message_parts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `session_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`content_json` text NOT NULL,
	`message_cutoff_id` text NOT NULL,
	`token_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_cutoff_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tool_invocations` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`message_id` text NOT NULL,
	`invocation_part_id` text NOT NULL,
	`result_part_id` text,
	`tool_call_id` text NOT NULL,
	`tool_name` text NOT NULL,
	`input_json` text,
	`output_json` text,
	`status` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`latency_ms` integer,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invocation_part_id`) REFERENCES `message_parts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`result_part_id`) REFERENCES `message_parts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tool_invocations_tool_call_id_unique` ON `tool_invocations` (`tool_call_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`command` text NOT NULL,
	`args` text NOT NULL,
	`env` text,
	`enabled` integer DEFAULT true NOT NULL,
	`include_resources` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_mcp_servers`("id", "name", "description", "command", "args", "env", "enabled", "include_resources", "created_at", "updated_at") SELECT "id", "name", "description", "command", "args", "env", "enabled", "include_resources", "created_at", "updated_at" FROM `mcp_servers`;--> statement-breakpoint
DROP TABLE `mcp_servers`;--> statement-breakpoint
ALTER TABLE `__new_mcp_servers` RENAME TO `mcp_servers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
