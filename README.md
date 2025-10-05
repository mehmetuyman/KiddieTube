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
