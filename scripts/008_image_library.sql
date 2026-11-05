-- Migration 008: image library (curated photos from the Marketing SharePoint Image Repository)
-- Run once on the KB database, after 005_uploads.sql:
--   psql "$DATABASE_URL" -f scripts/008_image_library.sql
--
-- Source: SharePoint nuvhosystems › Documents › Nuvho Pty Ltd › Marketing › 6. Content ›
-- Image Repository. Decision 2026-11-05: snapshot import, not a live Graph connection.
-- scripts/import-image-library.mjs resizes each photo (2400px JPEG + 480px thumbnail),
-- stores both as ordinary rows in nuvho_kb.uploads, and records them here. Editors pick
-- from this catalogue on the article Edit page; the hero then points at the existing
-- /uploads/<id>.jpg URL, so nothing is copied at pick time.
--
-- Re-running the import adds new photos, replaces changed ones (new upload rows; the old
-- rows stay because articles may still reference them) and marks photos that left the
-- folder as active = false (hidden from the picker, URLs keep working).

CREATE TABLE IF NOT EXISTS nuvho_kb.image_library (
  id               TEXT        PRIMARY KEY,               -- sha1 of source_path (stable across re-imports)
  source_path      TEXT        NOT NULL UNIQUE,           -- path inside Image Repository, '/'-separated
  source_sha1      CHAR(40)    NOT NULL,                  -- hash of the original file; unchanged = skipped
  collection       TEXT        NOT NULL,                  -- folder path, e.g. 'Regions/UK/UK London'
  title            TEXT        NOT NULL,                  -- filename without extension
  credit           TEXT,                                  -- e.g. 'Maria Kray / Pexels' when the filename says so
  width            INTEGER     NOT NULL CHECK (width > 0),   -- of the stored (resized) image
  height           INTEGER     NOT NULL CHECK (height > 0),
  upload_id        TEXT        NOT NULL REFERENCES nuvho_kb.uploads(id) ON DELETE RESTRICT,
  url              TEXT        NOT NULL,                  -- /uploads/<upload_id>.jpg
  thumb_upload_id  TEXT        NOT NULL REFERENCES nuvho_kb.uploads(id) ON DELETE RESTRICT,
  thumb_url        TEXT        NOT NULL,
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  imported_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nuvho_kb.image_library IS
  'Curated hero photos imported from the Marketing SharePoint Image Repository (scripts/import-image-library.mjs). Image bytes live in nuvho_kb.uploads.';

CREATE INDEX IF NOT EXISTS idx_image_library_active_collection
  ON nuvho_kb.image_library (collection, title) WHERE active;
