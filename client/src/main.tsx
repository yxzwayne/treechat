import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

function applyInitialTheme() {
  try {
    const raw = localStorage.getItem('treechat-theme')
    if (raw === 'light') {
      document.documentElement.dataset.theme = 'light'
    } else if (raw === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light'
    } else {
      document.documentElement.dataset.theme = 'dark'
    }
  } catch {
    document.documentElement.dataset.theme = 'dark'
  }
}

applyInitialTheme()

const el = document.getElementById('root')!
createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
