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

## Deploy to servermain.nuvho.com

1. Build image: `docker build -t knowledge-nuvho:latest .`
2. Push to server or transfer via `docker save`
3. Run `docker compose up -d` on the server
4. Point nginx at port 3000 for `knowledge.nuvho.com`

Health check endpoint: `GET /api/health`
