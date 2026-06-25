-- Migration 003: Add status column to nuvho_kb.articles
-- Run once on the production database.
-- Status values: 'pending' | 'published'

-- 1. Add status column (new articles default to 'pending')
ALTER TABLE nuvho_kb.articles
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';

-- 2. Mark all existing articles as published (backward compatibility)
UPDATE nuvho_kb.articles SET status = 'published' WHERE status = 'pending';

-- 3. Add check constraint
ALTER TABLE nuvho_kb.articles
  DROP CONSTRAINT IF EXISTS articles_status_check;
ALTER TABLE nuvho_kb.articles
  ADD CONSTRAINT articles_status_check CHECK (status IN ('pending', 'published'));

-- 4. Indexes for fast status filtering
CREATE INDEX IF NOT EXISTS idx_articles_status
  ON nuvho_kb.articles (status);
CREATE INDEX IF NOT EXISTS idx_articles_category_status
  ON nuvho_kb.articles (category_slug, status);

-- 5. Recalculate article_count to reflect only published articles
UPDATE nuvho_kb.categories c
SET article_count = (
  SELECT COUNT(*) FROM nuvho_kb.articles a
  WHERE a.category_slug = c.slug AND a.status = 'published'
);
