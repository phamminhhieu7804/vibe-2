import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Đăng ký Service Worker cho PWA để cài đặt như một App thực thụ
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true })
}

window.addEventListener('error', (event) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding:20px; color:red; font-size:12px;">
      <b>Runtime Error:</b> ${event.message}<br/>
      ${event.filename}:${event.lineno}<br/>
      ${event.error?.stack}
    </div>`;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML += `<div style="padding:20px; color:orange; font-size:12px;">
      <b>Promise Rejection:</b> ${event.reason?.message || event.reason}<br/>
      ${event.reason?.stack}
    </div>`;
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
