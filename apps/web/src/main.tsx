import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
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
