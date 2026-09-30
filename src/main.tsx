import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import { AppDataProvider } from './context/AppDataContext'
import { AuthProvider } from './context/AuthContext'
import { CallProvider } from './context/CallContext'
import './index.css'

createRoot(document.getElementById('root')!).render(<StrictMode><HashRouter><AuthProvider><AppDataProvider><CallProvider><App /></CallProvider></AppDataProvider></AuthProvider></HashRouter></StrictMode>)
