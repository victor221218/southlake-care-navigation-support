ALTER TABLE personal_case_memory
  ADD COLUMN retention TEXT NOT NULL DEFAULT 'automatic'
  CHECK (retention IN ('automatic', 'explicit'));

CREATE INDEX personal_case_memory_entry
  ON personal_case_memory(owner_id, retention, entry_type, entry_id);
