CREATE TABLE IF NOT EXISTS personal_documents (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, filename TEXT NOT NULL, digest TEXT NOT NULL,
  format TEXT NOT NULL, original_path TEXT, imported_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, warnings TEXT NOT NULL DEFAULT '[]',
  UNIQUE(owner_id, digest)
);
CREATE INDEX IF NOT EXISTS personal_documents_owner ON personal_documents(owner_id);
CREATE TABLE IF NOT EXISTS personal_cards (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, document_id TEXT REFERENCES personal_documents(id) ON DELETE CASCADE,
  source_key TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  locator TEXT NOT NULL DEFAULT '', fields_json TEXT NOT NULL DEFAULT '{}',
  contacts_json TEXT NOT NULL DEFAULT '[]', links_json TEXT NOT NULL DEFAULT '[]',
  archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, UNIQUE(document_id, source_key)
);
CREATE INDEX IF NOT EXISTS personal_cards_owner ON personal_cards(owner_id, archived, updated_at);
CREATE TABLE IF NOT EXISTS personal_comments (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, card_id TEXT NOT NULL REFERENCES personal_cards(id) ON DELETE CASCADE,
  body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS personal_comments_card ON personal_comments(owner_id,card_id);
