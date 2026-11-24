ALTER TABLE personal_comments ADD COLUMN tracker_key TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX personal_comments_tracker_row ON personal_comments(owner_id, tracker_key) WHERE tracker_key IS NOT NULL;
