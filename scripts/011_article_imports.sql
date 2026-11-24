-- Migration 011: HTML import with assets, and import approvals (NUVCL-201 / NUVCL-179)
--
-- Decision 24 Nov 2026 (Jose, from Jude's 20 Nov Claude Implementation Catchup):
--   * Importing a Claude document keeps its assets: inline SVG drawings (cleaned, brand fonts
--     embedded), images (data:, linked or in a .zip bundle) and MP4 video are stored as
--     uploads and placed where they were.
--   * Each article gets an Assets panel (per article, NOT the shared image library) to see,
--     replace and re-insert what came with its import, and a "Restore imported version".
--   * The nuvho-knowledge-save skill uploads pages after a one-click approval in the browser
--     (no tokens, nothing to set up) instead of writing to the database over SSH.
--
-- Additive and idempotent: new tables only, nothing existing changes. The app checks for
-- these tables (lib/importDb.ts) and hides the features until they exist, so the code can
-- be deployed before or after this runs. Needs PostgreSQL 13+ (gen_random_uuid()).

-- One row per import (editor Import menu or an upload from Claude). article_id is set when the
-- import is saved into an article: at once for the Claude path (it creates the pending
-- article), on "Save" for the editor path. Unattached imports older than a day can be
-- cleaned up (their uploads become unreferenced).
CREATE TABLE IF NOT EXISTS nuvho_kb.article_imports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id       INTEGER REFERENCES nuvho_kb.articles(id) ON DELETE CASCADE,
  source_name      TEXT NOT NULL,                       -- file name, or 'pasted HTML'
  source_kind      VARCHAR(8)  NOT NULL CHECK (source_kind IN ('html', 'zip', 'paste')),
  source_sha256    CHAR(64)    NOT NULL,
  source_bytes     INTEGER     NOT NULL CHECK (source_bytes >= 0),
  source_html      TEXT        NOT NULL,                -- the page itself (bundle files are not kept)
  title            TEXT        NOT NULL DEFAULT '',
  description      TEXT        NOT NULL DEFAULT '',
  imported_html    TEXT        NOT NULL,                -- the article body the import produced
  notes            JSONB       NOT NULL DEFAULT '[]'::jsonb,
  importer_version TEXT        NOT NULL,
  via              VARCHAR(8)  NOT NULL CHECK (via IN ('editor', 'claude')),
  created_by       TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attached_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_article_imports_article ON nuvho_kb.article_imports (article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_imports_unattached ON nuvho_kb.article_imports (created_at) WHERE article_id IS NULL;

-- The assets each import brought, in page order. upload_id is the stored file
-- (nuvho_kb.uploads, served at /uploads/<id>.<ext>); a replacement in the Assets panel
-- points upload_id at the new file and keeps the first one in original_upload_id.
CREATE TABLE IF NOT EXISTS nuvho_kb.import_assets (
  import_id          UUID        NOT NULL REFERENCES nuvho_kb.article_imports(id) ON DELETE CASCADE,
  position           INTEGER     NOT NULL CHECK (position > 0),
  kind               VARCHAR(8)  NOT NULL CHECK (kind IN ('svg', 'image', 'video')),
  role               VARCHAR(8)  NOT NULL CHECK (role IN ('icon', 'figure', 'inline', 'video')),
  upload_id          TEXT        REFERENCES nuvho_kb.uploads(id) ON DELETE SET NULL,
  original_upload_id TEXT        REFERENCES nuvho_kb.uploads(id) ON DELETE SET NULL,
  url                TEXT,                              -- /uploads/<id>.<ext>; NULL when it could not be stored
  source_ref         TEXT        NOT NULL,              -- "Inline SVG — …", "img/chart.png", a link
  alt                TEXT        NOT NULL DEFAULT '',
  width              INTEGER,
  height             INTEGER,
  error              TEXT,                              -- why it could not be stored
  content_sha256     CHAR(64),                          -- of the stored file: a re-export reuses it
  replaced_by        TEXT,
  replaced_at        TIMESTAMPTZ,
  PRIMARY KEY (import_id, position)
);
CREATE INDEX IF NOT EXISTS idx_import_assets_upload ON nuvho_kb.import_assets (upload_id);
CREATE INDEX IF NOT EXISTS idx_import_assets_sha ON nuvho_kb.import_assets (content_sha256) WHERE upload_id IS NOT NULL;

-- Import approvals for the nuvho-knowledge-save skill (lib/importGrants.ts). The skill asks for
-- permission (a row with status 'pending'), a signed-in staff member clicks Approve in the
-- browser, and the skill may then upload pages as that person, as PENDING articles, until
-- expires_at (8 hours). Only the SHA-256 of the skill's secret is stored. Nothing is created,
-- copied or set up by the person; rows older than a day are deleted by the app.
CREATE TABLE IF NOT EXISTS nuvho_kb.import_grants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_hash  CHAR(64)    NOT NULL UNIQUE,
  user_code    VARCHAR(9)  NOT NULL,                   -- shown in Claude and on the approval page
  client_label TEXT        NOT NULL DEFAULT '',        -- what asked, e.g. 'Claude Code on LAPTOP-12'
  request_ip   TEXT,
  status       VARCHAR(8)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  user_email   TEXT,                                   -- who approved or denied it
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at   TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_import_grants_pending ON nuvho_kb.import_grants (expires_at) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON nuvho_kb.article_imports, nuvho_kb.import_assets, nuvho_kb.import_grants TO nuvho_kb_user;
