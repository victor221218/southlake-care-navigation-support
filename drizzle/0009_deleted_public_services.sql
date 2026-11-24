CREATE TABLE personal_deleted_public_services (
  owner_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  PRIMARY KEY (owner_id, source_key)
);
