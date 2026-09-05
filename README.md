# Digital Corkboard

The standalone Notes room from Wardrobe: a Milanote-inspired infinite canvas with the original warm parchment design and an optional gray skin.

## Run locally

Install Node.js 22 or later, then run these commands from this folder:

```sh
npm ci
npm run dev
```

Open http://localhost:5181. The app opens directly to an empty Home board. No account, API keys, Supabase project, or other Wardrobe rooms are required.

```sh
npm test          # Notes unit tests and local database integration tests
npm run build    # TypeScript check and production build in dist/
npm run preview  # Preview the production build at http://localhost:4174
```

## Included

- Rich-text notes, checklists, headings, links, documents, images, file attachments, columns, color swatches, comments, and nested boards.
- Pan and zoom, drag and resize, multi-selection, arrows, board search, favorites, an Unsorted tray, and keyboard shortcuts.
- Undo/redo, restorable trash, and board exports to PNG, PDF, and Markdown.
- Both parchment and Milanote-style gray skins.

## Where your work is saved

Boards and uploaded files stay in this browser's IndexedDB database (`digital-corkboard`), using embedded PGlite/Postgres. The app automatically saves changes. Each browser profile and site address has its own separate data; use the same address and port when returning to your boards. Use one open app tab at a time.

Clearing site data, using private browsing, or deleting the browser profile can remove that work. Export important boards regularly. PNG/PDF/Markdown exports are readable copies, not a full database backup or re-import format. There is no cloud sync or collaboration service.

Link cards remain editable and clickable. Automatic website title/thumbnail fetching required Wardrobe's authenticated server and is unavailable in this standalone version. Fonts and remote links/embeds may require an internet connection.

## Hosting

`npm run build` produces a static site in `dist/`, suitable for a host serving it at the site root. Use HTTPS (or localhost). No server environment variables or database setup are needed. Hosting the app does not upload or share the boards: each visitor's work remains in their own browser.

## Extraction scope

Copied from `life-dashboard/app`: the Notes page, its helpers and tests, shared typography, its favicon, and the local database adapter. Only Notes schema migrations are included; the small shared timestamp trigger is included in the adapter prelude.

No personal notes, screenshots, database contents, credentials, other rooms, or source repository history are included. This is an independent application inspired by Milanote, not an official Milanote product.
