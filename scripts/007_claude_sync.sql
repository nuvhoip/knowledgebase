-- Migration 007: Claude → Knowledge Base sync (approval queue)
-- Run once on the production database (after 004).
--
-- Adds:
--   1. Source-tracking columns on nuvho_kb.articles (which vector DB entry an article came from)
--   2. nuvho_kb.vector_imports — one row per vector DB entry ever submitted to the KB. Imports
--      skip anything already logged, so an article an admin DENIES (deletes) is never re-imported.
--   3. A private "Claude Inbox" category + "General" sub-category: the holding area for
--      Claude-submitted articles that arrive without a known category.

-- ── 1. Article source columns ────────────────────────────────────────────────
ALTER TABLE nuvho_kb.articles ADD COLUMN IF NOT EXISTS source_tier       VARCHAR(20);
ALTER TABLE nuvho_kb.articles ADD COLUMN IF NOT EXISTS source_vector_id  VARCHAR(255);
ALTER TABLE nuvho_kb.articles ADD COLUMN IF NOT EXISTS submitted_by      VARCHAR(255);
ALTER TABLE nuvho_kb.articles ADD COLUMN IF NOT EXISTS submitted_via     VARCHAR(20);  -- 'claude-push' | 'claude-pull' | 'admin'

-- ── 2. Import log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nuvho_kb.vector_imports (
  source_tier       VARCHAR(20)  NOT NULL,
  source_vector_id  VARCHAR(255) NOT NULL,
  category_slug     VARCHAR(255),
  article_slug      VARCHAR(255),
  submitted_via     VARCHAR(20)  NOT NULL,
  submitted_by      VARCHAR(255),
  imported_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_tier, source_vector_id)
);

-- ── 3. Claude Inbox (private holding category) ──────────────────────────────
INSERT INTO nuvho_kb.categories (slug, title, description, icon, article_count, sort_order, visibility)
VALUES ('claude-inbox', 'Claude Inbox',
        'Articles submitted from Claude that are waiting for an admin to review, categorise and publish.',
        'comments.svg', 0, 999, 'private')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO nuvho_kb.subcategories (slug, category_slug, title, description, sort_order)
VALUES ('claude-inbox-general', 'claude-inbox', 'General', 'Unsorted Claude submissions.', 0)
ON CONFLICT (slug) DO NOTHING;
