CREATE TABLE personal_deleted_document_rows (
  owner_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES personal_documents(id) ON DELETE CASCADE,
  source_key_hash TEXT NOT NULL,
  PRIMARY KEY (owner_id, document_id, source_key_hash)
);
