CREATE TABLE `tool_permission_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text,
	`tool_name` text,
	`tool_pattern` text,
	`auto_approve` integer NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tool_permission_rules_server` ON `tool_permission_rules` (`server_id`);
--> statement-breakpoint
CREATE INDEX `idx_tool_permission_rules_priority` ON `tool_permission_rules` (`priority` DESC);
