-- Sleutels en instellingen per koppeling (Systeem & koppelingen). De sleutel staat versleuteld (AES-GCM met SHEETS_CONFIG_KEY)
-- en wordt nooit teruggegeven; alleen de laatste vier tekens (hint) zijn zichtbaar.
CREATE TABLE `integration_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`hint` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`updated` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL
);
