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
  default 10). Files are stored under `UPLOADS_DIR` as `<yyyy>/<mm>/<random>.<ext>` and served
  at `/uploads/…` by `app/uploads/[...path]/route.ts`.
- **Storage**: production mounts the `knowledge-uploads` Docker volume at `/app/uploads`
  (see `docker-compose.yml`). Back it up with the database. Local dev writes to `./uploads`.
- **Sanitising**: every save route runs the HTML through `lib/sanitize.ts` (allow-list of the
  tags, attributes and inline styles that `.nw-prose` renders) before it reaches Postgres.
- **Attachments** (PDF, Office files) are intentionally not accepted yet. To enable them, add
  the MIME type in `ALLOWED_TYPES` / `sniffType()` in `lib/uploads.ts` and widen
  `ACCEPTED_IMAGE_TYPES` in `lib/uploadClient.ts`.

## Deploy to servermain.nuvho.com

1. Build image: `docker build -t knowledge-nuvho:latest .`
2. Push to server or transfer via `docker save`
3. Run `docker compose up -d` on the server
4. Point nginx at port 3000 for `knowledge.nuvho.com`
5. Allow editor uploads through nginx — the default 1 MB body limit blocks them:

   ```nginx
   # /etc/nginx/sites-available/knowledge.nuvho.com — inside the server {} block
   client_max_body_size 12m;   # ≥ MAX_UPLOAD_MB plus multipart overhead
   ```

   Optional: serve uploads straight from the volume instead of through Node by adding
   `location /uploads/ { alias <volume mountpoint>/; expires 1y; add_header Cache-Control "public, immutable"; }`
   where the mountpoint is `docker volume inspect knowledge-nuvho_knowledge-uploads`.

Health check endpoint: `GET /api/health`
