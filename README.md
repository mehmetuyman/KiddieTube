KiddieTube React (TypeScript) migration scaffold

This folder contains a Vite + React + TypeScript starter to migrate the existing static PWA into a React app.

Quick start (from repository root):

# 1) Install dependencies
cd react-app
npm install

# 2) Copy static assets from the root `public/` to `react-app/public/` so icons and images are available.
# On Windows PowerShell you can run:
# Copy-Item -Path "..\public\icons\*" -Destination ".\public\icons\" -Recurse
# Copy-Item -Path "..\public\assets\*" -Destination ".\public\assets\" -Recurse
# Copy-Item -Path "..\public\css\styles.css" -Destination ".\public\styles.css"

# 3) Start dev server
npm run dev

# 4) Build / preview
npm run build
npm run preview

Notes:
- The scaffold uses the YouTube IFrame API similar to the original app. It includes a basic `YouTubeWrapper` to create the player and wire custom controls.
- Service worker and manifest are present in `public/`. You may replace the simple `sw.js` with the Vite PWA plugin configuration in `vite.config.ts`.
- After confirming the migration, you can either deploy the `react-app/dist` folder or move the project contents to the repo root.

## Parent panel (add / edit / remove videos)

The video list can be managed at runtime without touching `videos.json`.

**Open it** (hidden from kids): press-and-hold the header logo for ~0.7s, or
visit the app with `?parent=1` in the URL. Set an optional PIN in the Sync tab
to gate re-opening. The panel always closes on reload.

**What it does**
- **Add**: paste a YouTube link (or an 11-char video ID). The title is fetched
  automatically via YouTube's public oEmbed endpoint and stays editable; pick a
  category from the existing list or type a new one.
- **Edit / Delete**: per-row in the Videos tab.

**Where changes are stored** (`src/lib/videoStore.ts`)
1. If a shared GitHub Gist is configured on the device, edits are written there
   and every other device picks them up on next open.
2. Otherwise edits persist to `localStorage` on that device only.
3. The bundled `public/videos.json` is always the seed / fallback.

**Enabling cross-device sync** — in the panel's *Sync* tab:
1. Create a GitHub personal access token with the **`gist`** scope only.
2. Paste it and press **Create shared list** (makes a secret Gist), or paste an
   existing token + Gist ID and press **Connect to Gist**.
3. Repeat step 2 on other devices with the same token + Gist ID.

The token is stored in `localStorage` on that device; "Remove token from device"
clears it. "Reset list to bundled videos" restores `videos.json`.
