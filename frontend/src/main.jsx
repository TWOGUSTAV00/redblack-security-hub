import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/app.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => null);
  });
}

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission().catch(() => null);
}
