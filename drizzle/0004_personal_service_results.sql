ALTER TABLE personal_comments ADD COLUMN outcome TEXT CHECK (outcome IS NULL OR outcome IN ('worked','not_worked'));
ALTER TABLE personal_comments ADD COLUMN rating INTEGER CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5 AND rating = CAST(rating AS INTEGER)));
