CREATE TABLE reviews (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL COLLATE NOCASE,
  repo TEXT NOT NULL COLLATE NOCASE,
  pr_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  base_sha TEXT,
  layer_pr_number INTEGER,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'repository' CHECK (visibility IN ('repository', 'private')),
  author_subject TEXT NOT NULL,
  author_login TEXT,
  idempotency_key TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX reviews_idempotency_idx
  ON reviews (owner, repo, pr_number, head_sha, author_subject, idempotency_key);
CREATE INDEX reviews_repository_idx
  ON reviews (owner, repo, pr_number, updated_at DESC);

CREATE TABLE review_findings (
  id TEXT PRIMARY KEY NOT NULL,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  path TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'resolved')),
  created_by_subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (review_id, fingerprint)
);

CREATE INDEX review_findings_review_idx
  ON review_findings (review_id, status, severity);

CREATE TABLE review_notes (
  id TEXT PRIMARY KEY NOT NULL,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_subject TEXT NOT NULL,
  author_login TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX review_notes_review_idx
  ON review_notes (review_id, created_at);

CREATE TABLE review_events (
  id TEXT PRIMARY KEY NOT NULL,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  actor_subject TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX review_events_review_idx
  ON review_events (review_id, created_at);
