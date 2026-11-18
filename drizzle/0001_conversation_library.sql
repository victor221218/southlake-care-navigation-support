ALTER TABLE hive_outcomes ADD COLUMN satisfaction_sentiment text NOT NULL DEFAULT 'Unspecified';
CREATE TABLE hive_library_requests (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  context text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  deleted_at text
);
CREATE INDEX hive_library_owner ON hive_library_requests(owner_id,updated_at);
CREATE TABLE hive_library_feedback (
  id text PRIMARY KEY NOT NULL,
  owner_id text NOT NULL,
  request_id text NOT NULL REFERENCES hive_library_requests(id),
  slot text NOT NULL,
  payload text NOT NULL,
  outcome_id text,
  state text NOT NULL,
  created_at text NOT NULL,
  updated_at text NOT NULL,
  UNIQUE(owner_id,request_id,slot)
);
