# Knowledge Base: DB changes for Glenn (Oct 2026)

**From:** Jose, on behalf of the KB work from the IT Catchup (Tue 13 Oct 2026, Jude Bolger)
**For:** Glenn Pepito (DB owner). **Update 30 Oct 2026:** Jose took this over and applied A and C to production (see [Applied log](#applied-log-30-oct-2026)).
**Branch:** `feature/kb-jude-feedback-2026-10-13` (merged as nuvhoip/knowledgebase PR #5)

The app code is safe to merge as is: everything that needs a DB change sits behind a feature flag that is **off by default**, so the PR can merge before any of this is applied.

| # | Change | Status | Flag to switch on afterwards |
|---|--------|--------|------------------------------|
| A | `nuvho_kb.article_versions` (version history + restore) | **Applied 30 Oct 2026** (table, grants, backfill). Flag still off | `KB_VERSIONING_ENABLED=true`, once the PR #5 build is live |
| B | Retention job for A | Not scheduled yet | — |
| C | `nuvho_kb.topics` + `nuvho_kb.article_topics` | **Tables applied 30 Oct 2026**, empty. App code not written yet | (future) `KB_TOPICS_ENABLED` |
| D | Fields the content index can't show yet | Notes and options | — |

**Target for all SQL:** the KB database on `nuvho-vectordb` (209.38.90.132), database `nuvho_kb`, schema `nuvho_kb`. App DB user is `nuvho_kb_user` per `.env.example` (confirmed 30 Oct).

> **Before applying anything:** there is no scheduled backup job on this droplet that we could find (it also hosts the four vector DBs). Please take a `pg_dump` of `nuvho_kb` first, and consider a standing backup job. (A one-off dump was taken before the 30 Oct changes; a standing job is still missing.)

## Applied log (30 Oct 2026)

Applied by Jose via the Nuvho SSH connector, as `postgres`, in a single transaction (`psql -1 -v ON_ERROR_STOP=1`).

1. **Backup:** `pg_dump -Fc nuvho_kb` → `/root/backups/nuvho_kb_20261030_pre_versioning_topics.dump` on `nuvho-vectordb` (88 KB, mode 600, all 8 tables listed by `pg_restore -l`). Restore with `pg_restore -d nuvho_kb --clean` if needed.
2. **A:** steps 1–3 below exactly as written. The backfill ran at the same time rather than just before switch-on (agreed trade-off: if the import pipeline changes an article before the flag is on, that article's v1 is slightly older than its live content).
3. **C:** the SQL below exactly as written, with Q3 answered as **`ON DELETE SET NULL`** (subtopics of a deleted parent become top-level).
4. **Checks:** 6 articles, 6 v1 rows in `article_versions`; `topics` and `article_topics` empty; `nuvho_kb_user` has `USAGE` on `article_versions_id_seq` and `topics_id_seq`.

**Grants are broader than written.** `postgres` has default privileges in schema `nuvho_kb` that give `nuvho_kb_user` every table privilege on any table it creates (`arwdDxtm`), as on every existing table. So the app user can also `UPDATE`/`DELETE` version rows. The app never does, but to make history insert-only at the DB level:
```sql
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON nuvho_kb.article_versions FROM nuvho_kb_user;
```
Not applied yet. The retention job (B) should then run as `postgres` or another role that keeps `DELETE`.

**Not done:** B (retention job), switching on `KB_VERSIONING_ENABLED`, the topics app code and the naming decision in C.

---

## A. Version history: `nuvho_kb.article_versions`

### What it is
Each row is one saved state of an article: what the article looked like, who changed it, when and why. The app writes a new row on every content-changing save, in the **same transaction** as the save, so history can't miss an edit:

| Source | When |
|---|---|
| `editor` | Article edited (edit page or admin dashboard), with an optional "What changed?" note |
| `create` | Article created in the admin dashboard |
| `ingest` | Article created via `POST /api/admin/ingest` |
| `status` | Published / unpublished |
| `restore` | An older version restored (copied forward as a **new** version; nothing is deleted) |
| `baseline` | Written automatically before the first tracked change to an article with no history yet |
| `backfill` | Version 1 for every existing article (step 2 below) |

Saves that change nothing don't create a version. Restore copies title, description, body and read time only. Status, category and visibility are left as they are.

**Design decisions (agreed with Jose):**
- **`articles` is not altered.** "Current version" and "last updated by" are read from the latest version row, not stored twice.
- **Deleting an article deletes its history** (`ON DELETE CASCADE`). If you'd rather keep history for deleted articles, change the FK and tell us; restoring deleted articles would be a separate feature.
- **Writers outside this app bypass versioning.** The import pipeline writes `submitted_via = claude-pull` directly into `articles`, so its inserts and updates don't create versions. The `baseline` row covers this: the first time such an article is saved through the app, its prior state is kept as v1. If you want every pipeline write captured too, an `AFTER INSERT OR UPDATE` trigger is the alternative. Happy to discuss.

### 1. Create the table
```sql
CREATE TABLE nuvho_kb.article_versions (
  id               BIGSERIAL PRIMARY KEY,
  article_id       INTEGER NOT NULL REFERENCES nuvho_kb.articles(id) ON DELETE CASCADE,
  version_number   INTEGER NOT NULL CHECK (version_number > 0),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  content          TEXT,                         -- full stored HTML, hero figure included
  category_slug    TEXT NOT NULL,                -- plain copies, no FKs: history must survive
  subcategory_slug VARCHAR(255) NOT NULL,        -- category/sub-category renames and deletes
  status           VARCHAR(20) NOT NULL,
  visibility       VARCHAR(20),
  read_time        INTEGER,
  featured         BOOLEAN,
  changed_by       TEXT,                         -- editor email; NULL for backfill/baseline
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_summary   TEXT,
  source           VARCHAR(20) NOT NULL
                   CHECK (source IN ('backfill','baseline','editor','create','ingest','status','restore')),
  restored_from    INTEGER,                      -- version_number copied, when source = 'restore'
  CONSTRAINT article_versions_article_version_key UNIQUE (article_id, version_number)
);
```
The UNIQUE constraint's index on `(article_id, version_number)` serves every query the app makes, including "latest first" (btree scans backwards), so no extra index is needed. Concurrent saves of the same article are serialised by `SELECT … FOR UPDATE` on the article row.

### 2. Backfill: version 1 for every existing article
```sql
INSERT INTO nuvho_kb.article_versions
  (article_id, version_number, title, description, content, category_slug, subcategory_slug,
   status, visibility, read_time, featured, changed_by, changed_at, source, change_summary)
SELECT id, 1, title, description, content, category_slug, subcategory_slug,
       status, visibility, read_time, featured, NULL, NOW(), 'backfill',
       'Snapshot taken when version history was switched on'
FROM nuvho_kb.articles
ON CONFLICT (article_id, version_number) DO NOTHING;
```
It's safe to re-run (it skips articles that already have a v1). Run it just before switching the flag on, so v1 matches the live content.

### 3. Grants (only if the table is created by a role other than the app's)
```sql
GRANT SELECT, INSERT ON nuvho_kb.article_versions TO nuvho_kb_user;
GRANT USAGE ON SEQUENCE nuvho_kb.article_versions_id_seq TO nuvho_kb_user;
```
The app never updates or deletes version rows. Only the retention job (B) deletes.

### 4. Check
```sql
SELECT COUNT(*) AS articles FROM nuvho_kb.articles;
SELECT COUNT(*) AS v1_rows  FROM nuvho_kb.article_versions WHERE version_number = 1;  -- should match
```

### 5. Switch on
Set `KB_VERSIONING_ENABLED=true` in the App Platform environment. It's read at runtime, so no rebuild is needed. Then edit and save one article and confirm a v2 appears under "Version history" on its edit page.

### Rollback
1. Set `KB_VERSIONING_ENABLED=false` (or remove it). The app immediately goes back to its previous behaviour.
2. Only if you want the history gone:
```sql
DROP TABLE IF EXISTS nuvho_kb.article_versions;   -- deletes all history; also drops its sequence
```

---

## B. Retention job

**Policy (Q5, to confirm with you):** keep 12 months of history, but always keep the latest 10 versions of every article, so rarely edited articles never lose their history.

```sql
DELETE FROM nuvho_kb.article_versions v
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY article_id ORDER BY version_number DESC) AS rn
  FROM nuvho_kb.article_versions
) r
WHERE v.id = r.id
  AND r.rn > 10
  AND v.changed_at < NOW() - INTERVAL '12 months';
```

**Who and where:** your call. The app has no scheduler (App Platform, no cron component), so a monthly cron on `nuvho-vectordb` running the statement above via `psql` is probably simplest, e.g. `0 3 1 * *`, as a role with `DELETE` on the table. To switch to 6 months, change the interval only.

---

## C. Topics and subtopics (spec only, needs your sign-off)

**Status:** tables created in production on 30 Oct 2026 (empty); app code not built. We agreed to wait for your view on the model before writing code (Pass 5 is "spec-only" in the PR).

**Proposed model (Q7):** a **category** is where an article lives (exactly one, as today). **Topics** are cross-cutting tags (many per article) used to link related content, with an optional parent topic for subtopics.

> **Naming clash to resolve first:** the site header's **"Topics"** menu already lists *categories*, so a new thing called "topics" will confuse readers and editors. Options: call the new concept **"Tags"** in the UI (keeping `topics` in the DB is fine), or rename the header menu to "Categories". Jose and Odysseus to decide; it doesn't affect the SQL.

```sql
CREATE TABLE nuvho_kb.topics (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(255) NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  parent_id   INTEGER REFERENCES nuvho_kb.topics(id) ON DELETE SET NULL,  -- subtopic of …
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topics_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX idx_topics_parent ON nuvho_kb.topics (parent_id);

CREATE TABLE nuvho_kb.article_topics (
  article_id  INTEGER NOT NULL REFERENCES nuvho_kb.articles(id) ON DELETE CASCADE,
  topic_id    INTEGER NOT NULL REFERENCES nuvho_kb.topics(id)   ON DELETE CASCADE,
  PRIMARY KEY (article_id, topic_id)          -- also the index for "topics of an article"
);
CREATE INDEX idx_article_topics_topic ON nuvho_kb.article_topics (topic_id);  -- "articles with a topic"

GRANT SELECT, INSERT, UPDATE, DELETE ON nuvho_kb.topics, nuvho_kb.article_topics TO nuvho_kb_user;
GRANT USAGE ON SEQUENCE nuvho_kb.topics_id_seq TO nuvho_kb_user;
```
No backfill: articles start with no topics.

**Rollback:**
```sql
DROP TABLE IF EXISTS nuvho_kb.article_topics;
DROP TABLE IF EXISTS nuvho_kb.topics;
```

**Questions for you:**
1. Is this the model you had in mind, or did you mean something closer to a second category tree?
2. One level of subtopics, or arbitrary depth? (The table allows any depth; we'd enforce one level in the app unless you say otherwise.)
3. When a parent topic is deleted, should its subtopics become top-level (`SET NULL`, as above) or be deleted too? **Answered 30 Oct: `SET NULL`** (applied).
4. Should topic assignments be versioned with A? (Not in the current A design.)
5. Should the import pipeline set topics, e.g. from the vector DB metadata `tags`?

**Planned app work once agreed (behind `KB_TOPICS_ENABLED`, off by default):** a topic picker in the editor, topic chips on the article page, a "Related articles" block (shared topics, excluding the current article), and a topic filter on listings and the content index.

---

## D. Fields the content index (Pass 3) can't fully show yet

The new staff-only page `/admin/content-index` reads existing columns only. Gaps:

| Field | Today | With A switched on | Optional DB change |
|---|---|---|---|
| Version | "—" | Latest `version_number` | none |
| Last updated by | "—" | `changed_by` of the latest version (NULL for backfilled rows, so "—" until the first edit) | none |
| Last updated | `articles.updated_at` is a **DATE**, so day precision only | Exact time is in `article_versions.changed_at` | `ALTER TABLE nuvho_kb.articles ALTER COLUMN updated_at TYPE timestamptz USING updated_at::timestamptz;` is optional, and only if you want time-of-day on the live table. Check the import pipeline first, as it may write this column. |
| Imported from | `articles.source_tier`, written by the import pipeline | — | Data note: some rows have `source_tier = 'support'`, which isn't one of the four tiers (domain/internal/client/confidential). Worth checking the pipeline. |

**Roles (Q4):** access to the index and to Restore currently uses the existing staff check (any `@nuvho.com` account). `users.role` exists (default `'user'`) but isn't used for permissions. An admin vs team-lead split would need role values assigned in `nuvho_kb.users` plus a small app change. Not needed now; flagging it for later.

---

## Switch-on order

1. ~~Take a backup of `nuvho_kb`.~~ Done 30 Oct.
2. ~~**A:** create the table → run grants if needed → run the backfill → check the counts.~~ Done 30 Oct.
3. Set `KB_VERSIONING_ENABLED=true` on App Platform, then smoke-test one edit and one restore. **Wait until the PR #5 build is live:** earlier builds don't read this flag.
4. **B:** schedule the retention job (it can come later; nothing is deleted until a version is over 12 months old).
5. ~~**C:** only after you've answered the topics questions.~~ Tables done 30 Oct. The app code is still to be written, and the naming clash and questions 1, 2, 4 and 5 are still open.
