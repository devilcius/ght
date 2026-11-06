-- Keep deletion work durable when object storage is temporarily unavailable.
CREATE TABLE pending_media_deletions (
  object_key TEXT PRIMARY KEY
);
