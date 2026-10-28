import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>)

// Installable app: the service worker only runs on the hosted site.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
