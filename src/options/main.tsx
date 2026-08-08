import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/app.css'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('options.html is missing its #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
