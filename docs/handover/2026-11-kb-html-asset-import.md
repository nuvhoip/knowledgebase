# Knowledge Base: import HTML with its assets (Nov 2026)

Jira: NUVCL-201 (assets), NUVCL-179 (rich HTML import). Requirements from the Claude Implementation
Catchup on 20 Nov 2026; decisions by Jose on 24 Nov 2026.

## What changed

A Claude document (or any rich HTML page) now arrives in the KB with its **assets**, each stored on
the KB and placed where it was in the page:

| In the page | In the article |
|---|---|
| Inline `<svg>` diagram or chart | Cleaned SVG file (`/uploads/<id>.svg`) with **Comfortaa / Raleway embedded as subsets**, in a `<figure>`; its `<title>` becomes the alt text |
| Small inline SVG icon (≤ 64 px, no text) | Same, as `<img class="nw-icon">` (section icons go inside their heading) |
| `data:` image, linked image (`https://…`), file in a `.zip` (`img/a.png`) | Stored copy (`/uploads/<id>.<ext>`), with its size; linked images are downloaded, not hotlinked |
| `<video>` with an MP4 on `sftp.nuvho.com` | Plays from the link (not copied) |
| `<video>` with an MP4 file in the `.zip` or embedded | Stored (≤ 100 MB), plays from the KB |
| YouTube / Vimeo / Scribe `<iframe>` | Canonical embed (`youtube-nocookie.com`, `player.vimeo.com`, `scribehow.com/embed`) |
| SharePoint / Stream video, video on another site | A "Watch the video" link (SharePoint only plays for signed-in staff) |
| `<canvas>` chart | Cannot come across (reported); export it as an image or SVG |
| Lead paragraph (`.lead`), tag chips (`.tag`) | `nw-lead` paragraph; tags suggested for the Tags field |

Everything else about the conversion is unchanged (`lib/htmlImport.ts`, component vocabulary in
`lib/articleComponents.ts`).

### Ways in

- **Editor → Import → HTML or .zip file / Paste HTML.** `POST /api/admin/import` (staff session)
  converts and stores the assets; the author reviews and saves. Saving links the import to the
  article.
- **nuvho-knowledge-save skill 2.1.0** (Claude Code). It uploads the page or a `.zip` after a
  **one-click approval in the browser** (below; no tokens, nothing to set up): `POST /api/admin/import` with `mode=submit` creates (or, while still
  pending, updates) a **pending** article. A published article is never changed from Claude (409).
  Only the person who submitted an entry can update it from Claude (409 for anyone else). The
  skill's `scripts/kb_upload.py` (Python standard library) does the approval and the upload, and
  sends its text fields from UTF-8 files, so non-ASCII characters arrive intact on Windows.
- **Editor → Media**: upload an MP4 (≤ 100 MB), or insert an MP4 link on sftp.nuvho.com or a
  YouTube / Vimeo / Scribe embed.

### Reviewing and editing imported articles

- **Pending articles can be opened by staff**: the article page shows a staff-only preview with a
  "Pending review" note (no JSON-LD, `noindex`; readers still get "not found"), and the edit page
  (with its Assets panel) works before publishing. Admin → Articles has a **Preview** link per row.
- Re-exporting the same page reuses files already stored (matched by SHA-256), so assets are not
  duplicated.

- TinyMCE is configured to keep everything the importer writes (video, embeds, figures, classes).
- Each import is recorded with the body it produced (`nuvho_kb.article_imports`), and the save adds
  a version "Imported from <file>" (when `KB_VERSIONING_ENABLED` is on).
- The edit page has an **Assets** panel (per article; imports never touch the shared image library):
  every asset of the latest import, whether it is still in the text, **Insert** (re-inject at the
  cursor), **Replace** (new file, swapped everywhere it is used), **Open**, and
  **Restore imported version**.

### Approving uploads from Claude

There are no tokens and no admin tab (decision 24 Nov 2026: nothing new in the workflow).

1. The skill asks for permission: `POST /api/import-grants` (public, rate-limited). The KB returns
   a secret the skill keeps in a private temp file, a short code, and a link.
2. The skill opens the link (`/admin/approve-import/<id>`) in the browser, where the person is
   signed in to the KB. The page shows the code Claude showed, and **Approve** / **Deny**.
3. After Approve, the skill uploads as that person for **8 hours** (one click per Claude
   session). The page also has **End this approval now**.

A grant can only call `POST /api/admin/import` (upload + pending article). Only the SHA-256 of the
secret is stored (`nuvho_kb.import_grants`). An unapproved request expires after 10 minutes; at
most 5 can wait per address and 200 in total. Rows older than a day are deleted by the app.
Code: `lib/importGrants.ts`.

## Rollout

1. **Back up the database** (`pg_dump`).
2. Run **`scripts/011_article_imports.sql`**. From a laptop through the SSH tunnel:
   `node scripts/migrate-011.cjs check`, then `node scripts/migrate-011.cjs apply`. That runs the
   file in one transaction and verifies the result. Or, on the server: `psql -1 -f` as postgres.
   The migration (additive: three new tables, no changes to existing
   ones; needs PostgreSQL 13+ for `gen_random_uuid()`). The app hides the Assets panel and refuses
   uploads from Claude until it has run, so the deploy can go first.
3. knowledge.nuvho.com is DNS-only at Cloudflare, so its request limit does not apply. Check App Platform accepts large uploads (MP4 uploads and
   `.zip` imports). On plans with a lower limit, set `MAX_VIDEO_MB` to match.
4. Deploy. Optional settings: `MAX_VIDEO_MB` (default 100), `KB_VIDEO_LINK_HOSTS` (default
   `sftp.nuvho.com`).
5. Check:
   - Import `hotel-mcp-ecosystem-opinion.html` (Jude's test page, from
     `scratch-2026-11-19-457c5c.zip`). The diagram should appear in Comfortaa / Raleway.
     The import notes should say "Kept 1 drawing …".
   - Open the SVG URL directly. It should be served with `Content-Security-Policy … sandbox`.
   - Upload an MP4 with Media → Upload video, then seek in it. This checks byte ranges (status 206).
   - Save a page with the skill from Claude Code: the browser opens, click **Approve**, expect
     `201` and a pending article. A second save in the same session needs no click.
6. Release **nuvho-knowledge-save 2.1.0** to the organisation.

## Storage notes

- SVG and MP4 are new upload types in `nuvho_kb.uploads` (`ext` `svg` / `mp4`); files go to the
  same SFTP store. MP4s make the file folder grow faster: watch free space (the store refuses
  uploads below `SFTP_MIN_FREE_BYTES`) and include it in the backup as before.
- Imports that were never saved into an article keep their uploads. A cleanup job for
  `article_imports` rows with `article_id IS NULL` older than a day (and their unreferenced
  uploads) is not built yet.

## Security notes

- SVG is cleaned against an allow-list (`lib/svgSanitize.ts`: no scripts, handlers,
  `foreignObject`, animation or external references). It is also served with a CSP that allows
  only its own styles and embedded fonts/images, plus `sandbox`.
- Linked images are fetched only over https on port 443. Links to IPv6 literals are refused, and IPv4-in-IPv6 forms are decoded before the private-range check. Every DNS answer is checked against
  private, loopback, link-local and metadata ranges at connect time. Redirects are limited to 3,
  each re-checked. Images are capped at 10 MB, with a 15 s idle timeout and a 30 s cap on the whole
  download (`lib/remoteFetch.ts`).
- `.zip` bundles are limited to 300 files, 250 MB unpacked and 100 MB packed; the page inside one to 8 MB. Paths that climb
  out of the bundle (`../`) are ignored.
- The article sanitiser allows `<video>` only for KB uploads and the hosts in
  `KB_VIDEO_LINK_HOSTS`, and `<iframe>` only for the canonical YouTube / Vimeo / Scribe player
  URLs.

## Removed

`scripts/build-skill-importer.mjs`, `scripts/kb-import-cli.ts` and the bundled `kb-import.cjs` in
the skill: the KB converts pages itself now, so there is no copy of the importer to keep in step.
The old `POST /api/admin/import-html` is replaced by `POST /api/admin/import`.

## Verified end to end (25 Nov 2026)

On a throwaway Postgres 17 with migrations 003–011 applied in order, running the app from this branch
(31 checks, all passing):
- The skill's `kb_upload.py` asks for permission, prints the link and code, and never prints the secret.
- An upload before the click is refused. The approval page asks visitors to sign in; non-staff, cross-site
  requests and second decisions are refused.
- After Approve, Jude's page uploads as a pending article (201) with its diagram stored as SVG; the import
  is recorded as from Claude, by the approver; a non-ASCII title arrives intact.
- The grant lasts 8 hours, is refused on other admin routes, and stops working when ended, denied or expired.
- The 6th waiting request from one address gets 429.
