import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { LocaleProvider } from './lib/i18n.jsx';
import { ToastProvider } from './components/Toast.jsx';
import './index.css';

// Swap the deferred Google Fonts stylesheet to active — see index.html.
document.querySelectorAll('link[data-async-font]').forEach((link) => {
  link.media = 'all';
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LocaleProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  </React.StrictMode>
);
