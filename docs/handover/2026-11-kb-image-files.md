# Knowledge Base: image files out of Postgres (Nov 2026)

Public summary. The full runbook (server setup, network and firewall details, backups, the
rollout log) is kept in the internal copy of this document, not in this repository.

## Decision (9 Nov 2026)

Article and library images are stored as **plain files on a file server**, reached by the app
over **SFTP on the private network**, the same design as Nuvho Onboarding's `fileStore.js`.
Postgres keeps one metadata row per image in `nuvho_kb.uploads` (no bytes).

| | Before | After |
|---|---|---|
| Image bytes | `nuvho_kb.uploads.data` (bytea) | files on the file server, `<id>.<ext>` |
| `nuvho_kb.uploads` | metadata + bytes | metadata only (still the target of `image_library`'s foreign keys) |
| Image URLs | `/uploads/<id>.<ext>` | unchanged |
| Backups | in `pg_dump` | **not** in `pg_dump`: the file folder needs its own backup |

## How it works

- `lib/fileStore.mjs` has two drivers. `sftp` is for production: it pins the host key, uses
  connect and operation timeouts, keeps one shared connection that reconnects on its own, refuses
  uploads below a free-space floor and never overwrites a file. `local` is for development only.
- The app refuses to start if a storage setting is missing or invalid (`instrumentation.ts`), so
  App Platform keeps the previous deploy running.
- Settings: `UPLOAD_STORAGE`, `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_ROOT`,
  `SFTP_HOST_KEY_SHA256`, `SFTP_PRIVATE_KEY_B64` (encrypted), optional `SFTP_MIN_FREE_BYTES`.
  Values are in the internal runbook and in App Platform; see `.env.example` for descriptions.
- The App Platform app must be attached to the same VPC as the file server.

## Rollout

1. Back up the database (`pg_dump`).
2. Set up the SFTP store on the file server (internal runbook).
3. Run `scripts/009_uploads_files.sql`: `data` becomes nullable and `file_verified_at` is added.
4. Run `scripts/migrate-uploads-to-files.sh` (dry run, then `--yes`, then `--verify`) on the
   database server. It copies each image to a file, checks it by SHA-256 and marks the row.
5. Attach the app to the VPC, set the storage settings, deploy, and check: an old image, a library
   photo and a new upload (the response says `"backend":"sftp"`). Until step 7, images without a
   file are still served from `uploads.data`.
6. Re-run the copy script to pick up anything uploaded before the deploy.
7. After a fresh backup and explicit sign-off, run `scripts/010_uploads_drop_data.sql`. It
   refuses while any row with bytes is unverified, then drops `data` and runs `VACUUM FULL`.
   Irreversible except from the backup.

Status (9 Nov 2026): steps 1–4 are done (all images copied and verified), the app is attached to
the VPC and its storage settings are set. Steps 5–7 follow this merge.

## Running the image library import

`scripts/import-image-library.mjs` saves files through the same store, so it needs the
`UPLOAD_STORAGE=sftp` settings and, from a laptop, an SSH tunnel to the file server's SFTP port
(exact command in the internal runbook).
