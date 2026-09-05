# Digital Corkboard

A private, Milanote-inspired Notes workspace with the original parchment canvas and optional gray skin. React + Vite on the frontend, Vercel Functions on the server, and Neon Postgres for boards **and attachments**. No Supabase project or browser database is required.

## Deploy on Vercel

1. Import this GitHub repository into Vercel. Use the repository root (`./`), the **Vite** framework preset, `npm run build`, output directory `dist`, and **Node.js 22.x**. `vercel.json` supplies the build/output settings and API configuration.
2. Connect a **Neon** database using Vercel's Storage/Marketplace integration. Ensure the project has a server environment variable named **`DATABASE_URL`** containing the Neon connection string. **`POSTGRES_URL`** is also accepted. Apply it to the deployment environment you intend to use.
3. In Vercel's Neon **Query** editor (or the Neon SQL Editor), replace the editor contents with the entire [`db/schema.sql`](db/schema.sql) file and click **Run** once. Include the opening `DO $corkboard$` and final `$corkboard$;` lines. Use a dedicated database for this app. The script creates only this app's tables and is safe to rerun.
4. Add a server environment variable named **`BOARD_PASSWORD`**: choose a long, random password of **at least 16 characters**. Share it privately with your friend. Do not put it in this repository or prefix either secret with `VITE_`.
5. Deploy or redeploy after setting the environment variables. Open the site, unlock it, create a note, and reload to confirm persistence. Use the same production URL on another device to access the same workspace.

Vercel serves `/api/corkboard` as a Node function; `dist/` alone is no longer a complete deployment. Do not add a blanket rewrite that routes `/api/*` to `index.html`. If previews should use separate data, connect a separate Neon branch/database and password to the Preview environment.

Alternatively, with server variables available locally, apply the schema using:

```sh
npm run db:setup
```

That command reads `.env.local` if present and runs the schema in a transaction. Building the app does **not** modify a database. The API shows a setup error instead of falling back to unsaved/local data if Neon is unavailable.

## Run locally

Install Node.js 22, then:

```sh
npm ci
```

Copy `.env.example` to `.env.local` and replace the sample values with your development Neon connection and a private workspace password. Run `npm run db:setup`, then:

```sh
npm run dev
```

Open http://localhost:5181. Vite runs the same API handler locally. Use a development database/branch when testing.

```sh
npm test          # Notes tests plus isolated Postgres/API integration tests
npm run build    # TypeScript check and Vite production build
npm run preview  # Local production preview with the API, using .env.local
```

Tests use throwaway in-memory Postgres (PGlite); they never connect to a real Neon database. PGlite is a test dependency only and is absent from the production browser bundle.

## Features

- Rich-text notes, checklists, headings, links, documents, images, file attachments, columns, color swatches, comments, and nested boards.
- Pan/zoom, multi-selection, arrows, search, starred boards, Unsorted tray, keyboard shortcuts, and both visual skins.
- Undo/redo, restorable trash, and board exports to PNG, PDF, and Markdown.
- Ordered remote saves, a retry button for unsaved editor changes, and an unlock prompt that preserves the open board when a session expires.
- A Lock button that waits for pending saves before allowing you to lock the workspace.

## Data and access

This deployment has **one shared private workspace**, not separate user accounts or real-time collaboration. Anyone with its password can read and edit its contents. Avoid editing the same card simultaneously on different devices; refresh to see edits from another device.

The API verifies a signed, HttpOnly, SameSite cookie before database or attachment access. Production cookies are Secure and expire after seven days. Login attempts are limited in the database. Changing `BOARD_PASSWORD` and redeploying invalidates previous sessions. The database URL and password stay on the server.

Notes, nested boards, trash, images, and files persist in Neon. Board view preferences (zoom, skin, recent boards) remain device-local. Attachments may be up to **25 MB each**; uploads and downloads use 512 KB chunks to stay below Vercel's function payload limit. Large files take multiple requests and consume database storage. Individual JSON operations are limited to 2 MB and list responses to 4 MB.

Existing notes from the earlier browser-storage version are **not automatically uploaded**. Export anything you need before switching; leave that browser's site data intact. PNG/PDF/Markdown exports are readable copies, not a full database restore format. For full backups, back up the Neon database, including `corkboard_files` and `corkboard_file_chunks`.

Link cards remain editable/clickable. Automatic website metadata previews are still unavailable. Fonts and external embeds require internet access.

## Troubleshooting

- **cannot insert multiple commands into a prepared statement**: you have the older multi-statement schema. Replace the entire editor contents with the latest db/schema.sql from this repository. The new version wraps setup in one PostgreSQL DO statement. Do not paste it beneath the old script.

- **Set BOARD_PASSWORD…**: configure a password of at least 16 characters in the correct Vercel environment, then redeploy.
- **Database setup is incomplete**: run `db/schema.sql` against the database used by the deployment.
- **Database request failed**: check the Neon connection variable and database availability. Connection details are deliberately not exposed in browser errors.
- **Could not save / Retry save**: keep the page open, restore the connection, and click Retry save. Do not reload away unsaved work.

## Provenance

Extracted from the Wardrobe Notes room without other rooms, personal notes, credentials, screenshots, or original repository history. This is an independent app inspired by Milanote, not an official Milanote product.

Technical references: [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver), [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js), [Vercel payload limits](https://vercel.com/docs/functions/limitations).
