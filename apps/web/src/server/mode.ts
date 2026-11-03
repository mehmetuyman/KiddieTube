// Server mode = the self-hosted, multi-family build (kids.tinyapps.dev), built
// with VITE_SERVER_MODE=true. Without it the app behaves exactly as the
// original single-family GitHub Pages version (Gist sync, parent pop-up).
export const SERVER_MODE = import.meta.env.VITE_SERVER_MODE === 'true'
