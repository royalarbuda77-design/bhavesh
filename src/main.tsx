import ReactDOM from 'react-dom/client'
import App from './App'
import { initializeNativeApp, isNativeApp } from './lib/native'
import './styles.css'
import './hd-mode.css'

void initializeNativeApp()
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeApp()) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined))
}
