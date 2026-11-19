CREATE TABLE personal_cases (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, origin_id TEXT NOT NULL,
  title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  selected_card_id TEXT REFERENCES personal_cards(id) ON DELETE SET NULL,
  archive_card_id TEXT REFERENCES personal_cards(id) ON DELETE SET NULL,
  draft TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1, UNIQUE(owner_id,origin_id)
);
CREATE INDEX personal_cases_owner ON personal_cases(owner_id,status,updated_at);
CREATE TABLE personal_case_messages (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, case_id TEXT NOT NULL REFERENCES personal_cases(id) ON DELETE CASCADE,
  origin_id TEXT NOT NULL, sequence INTEGER NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  body TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}', state TEXT NOT NULL DEFAULT 'complete',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(case_id,sequence), UNIQUE(case_id,origin_id)
);
CREATE INDEX personal_case_messages_order ON personal_case_messages(owner_id,case_id,sequence);
CREATE TABLE personal_case_memory (
  case_id TEXT NOT NULL REFERENCES personal_cases(id) ON DELETE CASCADE, owner_id TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('card','comment')), entry_id TEXT NOT NULL,
  PRIMARY KEY(case_id,entry_type,entry_id)
);
CREATE TABLE personal_case_workspace (
  owner_id TEXT PRIMARY KEY, active_case_id TEXT REFERENCES personal_cases(id) ON DELETE SET NULL
);
CREATE TABLE personal_input_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, entry_type TEXT NOT NULL,
  entry_id TEXT NOT NULL, card_id TEXT, label TEXT NOT NULL, before_json TEXT, after_json TEXT,
  applied INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX personal_input_history_owner ON personal_input_history(owner_id,id);
