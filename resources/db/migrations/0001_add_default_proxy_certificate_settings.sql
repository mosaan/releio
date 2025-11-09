-- Migration: Add default proxy and certificate settings
-- Sets system mode as default for both proxy and certificate configuration

-- Insert default proxy settings (system mode)
INSERT OR IGNORE INTO settings (key, value) VALUES ('proxy', '{"mode":"system"}');

-- Insert default certificate settings (system mode)
INSERT OR IGNORE INTO settings (key, value) VALUES ('certificate', '{"mode":"system","rejectUnauthorized":true}');
