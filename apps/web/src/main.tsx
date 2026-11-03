import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Fonts are bundled (no Google Fonts requests; they work offline). Only the
// weights the themes use; each file is split by alphabet (incl. Turkish).
import '@fontsource/baloo-2/500.css'
import '@fontsource/baloo-2/700.css'
import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import './styles-v2.css'
import './themes.css'
import { applyTheme, getTheme } from './lib/theme'

// also sets the title-bar colour; index.html already set data-theme pre-paint
applyTheme(getTheme())

const root = document.getElementById('root')!
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
