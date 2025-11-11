CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`command` text NOT NULL,
	`args` text NOT NULL,
	`env` text,
	`enabled` integer DEFAULT 1 NOT NULL,
	`include_resources` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
