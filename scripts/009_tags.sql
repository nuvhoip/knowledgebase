-- Migration 009: article tags (KB_TAGS_ENABLED)
--
-- The tag tables are handover C (docs/handover/2026-10-kb-db-changes-for-glenn.md), already
-- created in production on 30 Oct 2026. This file is idempotent: on production it changes
-- nothing; on a fresh database (dev, staging) it creates the tables and grants.
--
-- UI name: "Tags" (the header's "Topics" menu lists categories). DB name stays `topics`.
-- Written by: the editor's Tags field, POST /api/admin/ingest (`tags`), and Sync from Claude
-- (vector metadata.tags from the nuvho-knowledge-save skill, 1.6.0+).

CREATE TABLE IF NOT EXISTS nuvho_kb.topics (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(255) NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  parent_id   INTEGER REFERENCES nuvho_kb.topics(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topics_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS idx_topics_parent ON nuvho_kb.topics (parent_id);

CREATE TABLE IF NOT EXISTS nuvho_kb.article_topics (
  article_id  INTEGER NOT NULL REFERENCES nuvho_kb.articles(id) ON DELETE CASCADE,
  topic_id    INTEGER NOT NULL REFERENCES nuvho_kb.topics(id)   ON DELETE CASCADE,
  PRIMARY KEY (article_id, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_article_topics_topic ON nuvho_kb.article_topics (topic_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON nuvho_kb.topics, nuvho_kb.article_topics TO nuvho_kb_user;
GRANT USAGE ON SEQUENCE nuvho_kb.topics_id_seq TO nuvho_kb_user;

-- Check
-- SELECT to_regclass('nuvho_kb.topics'), to_regclass('nuvho_kb.article_topics');
-- Rollback (deletes every tag): DROP TABLE nuvho_kb.article_topics; DROP TABLE nuvho_kb.topics;
