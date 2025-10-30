import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles-v2.css'

const root = document.getElementById('root')!
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
