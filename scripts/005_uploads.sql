-- Migration 005: editor image uploads stored in the database (lib/uploads.ts)
-- Run once on the production database (scripts/run-migration.js only covers the users table):
--   psql "$DATABASE_URL" -f scripts/005_uploads.sql
--
-- Images uploaded through the article editor / hero field are kept here and served by
-- the app at /uploads/<id>.<ext>. Decision 2026-09-25: knowledge.nuvho.com runs on
-- DigitalOcean App Platform (no persistent disk) and a paid object store was ruled out,
-- so the existing nuvho_kb database is the store. Sizes are capped at MAX_UPLOAD_MB
-- (default 10 MB) per image by the upload route; bytea rows are TOASTed out of line.

CREATE TABLE IF NOT EXISTS nuvho_kb.uploads (
  id           TEXT        PRIMARY KEY,                 -- <base36 ms>-<12 hex>, also the URL name
  ext          VARCHAR(8)  NOT NULL,                    -- jpg | png | webp | gif
  mime         VARCHAR(64) NOT NULL,
  size_bytes   INTEGER     NOT NULL CHECK (size_bytes > 0),
  data         BYTEA       NOT NULL,
  uploaded_by  TEXT,                                    -- staff email from the session
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nuvho_kb.uploads IS
  'Editor image uploads (knowledge.nuvho.com). Served at /uploads/<id>.<ext>; referenced by URL from articles.content.';

-- For admin listings / housekeeping (e.g. finding uploads no article references)
CREATE INDEX IF NOT EXISTS idx_uploads_created_at ON nuvho_kb.uploads (created_at DESC);
