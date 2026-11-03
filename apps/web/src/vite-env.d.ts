/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly BASE_URL: string
  // add other Vite env vars here as needed, e.g. readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
