-- Migration 004: Sub-categories + Visibility (Public/Private)
-- Run once on the production database.
--
-- Adds:
--   1. nuvho_kb.categories.visibility        ('public' | 'private', default 'public')
--   2. nuvho_kb.subcategories                (new table, required layer under categories)
--   3. nuvho_kb.articles.subcategory_slug    (NOT NULL after backfill)
--   4. nuvho_kb.articles.visibility          ('public' | 'private' | NULL = inherit)
--   5. Backfill: one "General" sub-category per existing category, all existing
--      articles assigned to it.
--   6. Trigger keeping articles.category_slug in sync with its sub-category's parent,
--      so existing category-scoped queries/routes keep working unchanged.
--
-- Visibility resolution (most specific wins, default 'public' at the top):
--   effective_visibility(article) =
--     COALESCE(article.visibility, subcategory.visibility, category.visibility)

-- ── 1. Category visibility ───────────────────────────────────────────────────
ALTER TABLE nuvho_kb.categories
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'public';

ALTER TABLE nuvho_kb.categories
  DROP CONSTRAINT IF EXISTS categories_visibility_check;
ALTER TABLE nuvho_kb.categories
  ADD CONSTRAINT categories_visibility_check CHECK (visibility IN ('public', 'private'));

-- ── 2. Sub-categories table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nuvho_kb.subcategories (
  slug           VARCHAR(255) PRIMARY KEY,
  category_slug  VARCHAR(255) NOT NULL REFERENCES nuvho_kb.categories(slug) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  article_count  INTEGER NOT NULL DEFAULT 0,
  -- NULL = inherit visibility from the parent category
  visibility     VARCHAR(20),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE nuvho_kb.subcategories
  DROP CONSTRAINT IF EXISTS subcategories_visibility_check;
ALTER TABLE nuvho_kb.subcategories
  ADD CONSTRAINT subcategories_visibility_check CHECK (visibility IS NULL OR visibility IN ('public', 'private'));

CREATE INDEX IF NOT EXISTS idx_subcategories_category_slug
  ON nuvho_kb.subcategories (category_slug);

-- ── 3. Article columns ───────────────────────────────────────────────────────
ALTER TABLE nuvho_kb.articles
  ADD COLUMN IF NOT EXISTS subcategory_slug VARCHAR(255) REFERENCES nuvho_kb.subcategories(slug);

ALTER TABLE nuvho_kb.articles
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20);

ALTER TABLE nuvho_kb.articles
  DROP CONSTRAINT IF EXISTS articles_visibility_check;
ALTER TABLE nuvho_kb.articles
  ADD CONSTRAINT articles_visibility_check CHECK (visibility IS NULL OR visibility IN ('public', 'private'));

CREATE INDEX IF NOT EXISTS idx_articles_subcategory_slug
  ON nuvho_kb.articles (subcategory_slug);

-- ── 4. Backfill: one default "General" sub-category per category ────────────
INSERT INTO nuvho_kb.subcategories (slug, category_slug, title, description, sort_order)
SELECT c.slug || '-general', c.slug, 'General', 'General articles in this category.', 0
FROM nuvho_kb.categories c
ON CONFLICT (slug) DO NOTHING;

UPDATE nuvho_kb.articles a
SET subcategory_slug = a.category_slug || '-general'
WHERE a.subcategory_slug IS NULL;

-- Now that every article has a sub-category, make it required (sub-categories are
-- a required layer: every article belongs to exactly one sub-category).
ALTER TABLE nuvho_kb.articles
  ALTER COLUMN subcategory_slug SET NOT NULL;

-- ── 5. Keep articles.category_slug in sync with the sub-category's parent ───
-- Existing routes/queries key off articles.category_slug directly (e.g.
-- /articles/[categorySlug]/[slug]). This trigger guarantees it can never drift
-- from subcategory_slug's actual parent category, even if application code
-- forgets to set it explicitly.
CREATE OR REPLACE FUNCTION nuvho_kb.sync_article_category_slug()
RETURNS TRIGGER AS $$
BEGIN
  SELECT category_slug INTO NEW.category_slug
  FROM nuvho_kb.subcategories
  WHERE slug = NEW.subcategory_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_article_category_slug ON nuvho_kb.articles;
CREATE TRIGGER trg_sync_article_category_slug
  BEFORE INSERT OR UPDATE OF subcategory_slug ON nuvho_kb.articles
  FOR EACH ROW
  EXECUTE FUNCTION nuvho_kb.sync_article_category_slug();

-- ── 6. Recalculate subcategory article_count (published only, mirrors categories) ──
UPDATE nuvho_kb.subcategories s
SET article_count = (
  SELECT COUNT(*) FROM nuvho_kb.articles a
  WHERE a.subcategory_slug = s.slug AND a.status = 'published'
);
