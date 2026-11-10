# knowledge.nuvho.com

Nuvho Knowledge Base — built with Next.js 14, Tailwind CSS, and the Nuvho brand system.

## Quick start (local dev)

```bash
# Install dependencies
npm install

# Start dev server (hot reload)
npm run dev
# → http://localhost:3000
```

## Docker — local

```bash
# Hot-reload dev mode (no build step)
docker compose -f docker-compose.dev.yml up

# Production build + run
docker compose up --build
```

## Docker — production image

```bash
docker build -t knowledge-nuvho:latest .
docker run -p 3000:3000 knowledge-nuvho:latest
```

## Project structure

```
app/                     Next.js App Router pages
  page.tsx               Homepage (hero + category grid)
  search/page.tsx        Search results
  categories/[slug]/     Category listing
  articles/[cat]/[slug]/ Article detail
  api/health/            Health check → GET /api/health
components/              Reusable UI
  Header.tsx             Blue Slate nav + logo
  SearchHero.tsx         Search input with popular tags
  CategoryGrid.tsx       8-category card grid
  ArticleCard.tsx        Article list item
  Footer.tsx             Iron Grey footer
lib/
  data.ts                Mock categories + articles
  types.ts               TypeScript interfaces
public/
  logo-white.svg         Nuvho logo (for dark backgrounds)
  logo-primary.svg       Nuvho logo (for light backgrounds)
  icons/                 56 Nuvho duotone brand icons
```

## Brand tokens

| Token | Value | Usage |
|-------|-------|-------|
| Blue Slate | `#28687F` | Primary CTA, header, buttons |
| Steel Blue | `#6BA1BF` | Accents, links |
| Tropical Teal | `#80B9BF` | Hover states, card borders |
| Iron Grey | `#414B4C` | Body text, footer |
| Platinum | `#E9EAEC` | Backgrounds, dividers |

Fonts: **Comfortaa** (headings) · **Raleway** (body) — loaded from Google Fonts.

## Article editor & image uploads

Staff (@nuvho.com) edit article bodies in a self-hosted **TinyMCE 8** editor
(GPL, bundled from npm — no Tiny Cloud account or API key, no runtime calls to tiny.cloud).
It runs in inline mode inside the page so it inherits the brand fonts and the `.nw-prose`
article styles. The `<>` toolbar button still exposes the raw HTML.

- **Images** dropped, pasted or inserted in the editor, and the hero image field, upload to
  `POST /api/admin/uploads` (images only — JPG, PNG, WebP, GIF — up to `MAX_UPLOAD_MB`,
  default 10) and are referenced by URL from the article HTML.
- **Storage** (`lib/fileStore.mjs`, `UPLOAD_STORAGE`), decision 9 Nov 2026, same design as
  Nuvho Onboarding:
  - **`sftp` (production)**: plain files on a file server, written and read over SFTP on the
    private VPC (chrooted, key-only SFTP user, pinned host key). The App Platform containers have
    no persistent disk, so files can't live in the app.
  - **`local` (development)**: files under `UPLOADS_DIR` (default `./uploads`). Refused when
    `NODE_ENV=production`.
  - Postgres keeps one **metadata row** per image in `nuvho_kb.uploads` (no bytes). Images are
    served by the app at `/uploads/<id>.<ext>` with immutable caching; Cloudflare caches them at
    the edge. Uploads above the 5 GB free-space floor are refused (507); if the file server is
    unreachable images answer 502 and the rest of the site keeps working.
  - A missing or invalid storage setting stops the app from starting (`instrumentation.ts`).
  - The upload response includes `backend: "sftp" | "local"` so a deployment can be checked
    with one test upload.
  - Images are **not** in `pg_dump` backups: see
    [docs/handover/2026-11-kb-image-files.md](docs/handover/2026-11-kb-image-files.md).
- **Sanitising**: every save route runs the HTML through `lib/sanitize.ts` (allow-list of the
  tags, attributes and inline styles that `.nw-prose` renders) before it reaches Postgres.
- **Attachments** (PDF, Office files) are intentionally not accepted yet. To enable them, add
  the MIME type in `ALLOWED_TYPES` / `sniffType()` in `lib/uploads.ts` and widen
  `ACCEPTED_IMAGE_TYPES` in `lib/uploadClient.ts`.

## Image library (hero images)

The hero image field (on an article's Edit page, and in the admin dashboard's article form for new and
existing articles) can also **Choose from library**: curated photos from the Marketing
SharePoint *Image Repository*, imported as a snapshot. Selecting a photo opens a preview of the real
article hero and tile (desktop / mobile) before it is applied; nothing is saved until "Save changes".

- `scripts/008_image_library.sql` creates `nuvho_kb.image_library` (each photo points at `nuvho_kb.uploads` rows; the files are in the file store).
- `scripts/import-image-library.mjs "<path>/Image Repository" --dry-run | --yes` resizes every photo to a
  2400px JPEG plus a 480px thumbnail, saves both in the file store and records them. It needs the
  `UPLOAD_STORAGE=sftp` settings and an SSH tunnel to the file server (see the internal runbook). Re-run
  whenever marketing adds photos; unchanged files are skipped and removed ones are hidden.
- No env setting: the option appears by itself once the table exists and the import has stored at least one
  photo (`hasLibraryImages()` in `lib/imageLibraryDb.ts`). Until then both forms are unchanged.
- The preview is the staff-only `/admin/hero-preview` page, built entirely from the unsaved form, so it also works
  for an article that has not been created yet.

Rollout steps: [docs/handover/2026-11-kb-image-library.md](docs/handover/2026-11-kb-image-library.md).

## Tags, SEO and GEO

**Tags** (UI name; stored in `nuvho_kb.topics` / `nuvho_kb.article_topics`, see `scripts/009_tags.sql`)
are cross-cutting labels, many per article. A category is still where an article lives.

- **Where tags come from:** the editor's Tags field, `POST /api/admin/ingest` (`tags`), and
  Sync from Claude, which reads `metadata.tags` written by the `nuvho-knowledge-save` skill
  (1.6.0+). The skill recommends tags from the article and lets the user change them first.
  `GET /api/tags` lists the tags in use so the skill reuses them instead of making near-duplicates.
- **`KB_TAGS_ENABLED=true`** shows them to readers: chips under the article lede, `/tags/[slug]`
  pages, "Related articles" (shared tags), tag names in search, tag pages in the sitemap and
  tags as `keywords` / `article:tag` / JSON-LD `about`. Tags sent by Claude are stored even while
  the flag is off (whenever the tables exist), so nothing is lost before switch-on.
- Tag pages with fewer than 2 public articles are `noindex, follow` and left out of the sitemap
  (thin content).

**SEO** — every page has a canonical URL; articles have Open Graph `article` tags, Twitter cards,
`<time dateTime>` and JSON-LD (`TechArticle`, `BreadcrumbList`, plus `FAQPage` when an article
has 2+ question headings ending in "?"). Categories and tag pages carry `CollectionPage` JSON-LD,
the home page `WebSite` + `Organization`. `/sitemap.xml` lists public categories, articles and tag
pages; `/robots.txt` keeps admin, API, auth, search and edit pages out. Members-only articles are
`noindex` and never appear in the sitemap, JSON-LD or llms files.

**GEO (generative engine optimisation)** — so AI answer engines (ChatGPT search, Perplexity,
Google AI Overviews, Claude, Copilot) can find, read and cite the KB:
- `/llms.txt` (llmstxt.org index of public articles by category) and `/llms-full.txt` (every public
  article as markdown, each with its canonical URL and last-updated date).
- `robots.txt` names the AI search and assistant crawlers explicitly (list in `lib/seo.ts`
  `AI_CRAWLERS`). Training-only crawlers (GPTBot, CCBot, Google-Extended, Applebot-Extended) are
  allowed too; remove them there to opt out of model training while staying in AI search.
- Writing guidance (also in the skill): an answer-first description of 140–160 characters,
  question-style headings for FAQs and troubleshooting, and specific tags.

Pure helpers live in `lib/seo.ts` and `lib/tags.ts` (unit tested); crawler listings in
`lib/publicIndex.ts`.

## Deploy

Production (knowledge.nuvho.com) runs on **DigitalOcean App Platform** behind Cloudflare, built
from this repository. Set the environment variables from `.env.example` in the App Platform
component settings. For image uploads (full steps:
[docs/handover/2026-11-kb-image-files.md](docs/handover/2026-11-kb-image-files.md)):

1. Attach the app to the VPC (Settings → VPC), so it can reach the file server.
2. Run `scripts/005_uploads.sql` and `scripts/009_uploads_files.sql` once against the
   production database.
3. Set `UPLOAD_STORAGE=sftp` and the `SFTP_*` settings (the private key as an encrypted
   variable). Never `local` on App Platform: the container disk is wiped on every deploy, and
   the app refuses to start with it.
4. Deploy, check the log shows `[startup] image storage: sftp`, then upload one image from an
   article's Edit page and confirm the response's `backend` is `sftp` and the image loads at
   its `/uploads/<id>.<ext>` URL.

### Alternative: Docker host (servermain)

1. Build image: `docker build -t knowledge-nuvho:latest .`
2. Push to server or transfer via `docker save`
3. Run `docker compose up -d` on the server
4. Point nginx at port 3000 for `knowledge.nuvho.com`
5. Use `UPLOAD_STORAGE=sftp` like App Platform, or keep files on a Docker volume with
   `UPLOAD_STORAGE=local` plus `UPLOADS_LOCAL_IN_PRODUCTION=true` (mount a volume at
   `/app/uploads`; `docker-compose.yml` declares `knowledge-uploads`).
6. Allow editor uploads through nginx — the default 1 MB body limit blocks them:

   ```nginx
   # /etc/nginx/sites-available/knowledge.nuvho.com — inside the server {} block
   client_max_body_size 12m;   # ≥ MAX_UPLOAD_MB plus multipart overhead
   ```

   Optional: serve uploads straight from the volume instead of through Node by adding
   `location /uploads/ { alias <volume mountpoint>/; expires 1y; add_header Cache-Control "public, immutable"; }`
   where the mountpoint is `docker volume inspect knowledge-nuvho_knowledge-uploads`.

Health check endpoint: `GET /api/health`
