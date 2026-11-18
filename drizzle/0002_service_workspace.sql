ALTER TABLE hive_library_requests ADD COLUMN selected_service_id text;
CREATE TABLE hive_service_comments (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  service_id text NOT NULL,
  request_id text,
  outcome_id text,
  body text NOT NULL,
  source text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  deleted_at text
);
CREATE INDEX hive_comments_owner_service ON hive_service_comments(owner_id,service_id,updated_at);
CREATE TABLE hive_active_workspace (
  owner_id text PRIMARY KEY NOT NULL,
  request_id text,
  updated_at text NOT NULL
);
