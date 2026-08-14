// Build-time-only entry point — never shipped to the browser, never
// imported by main.jsx. Used exclusively by scripts/prerender.mjs (via
// Vite's SSR module loader) to render the public marketing pages to a
// static HTML string, so a non-JS crawler sees real content instead of an
// empty <div id="root"></div>. See CLAUDE.md for the scope of this: it
// prerenders for crawlers, it does not hydrate — main.jsx still boots with
// plain createRoot(), which replaces this markup on mount. A signed-in
// browser never sees prerendered output at all (see the splice logic in
// server/index.js, which only serves it on a session-less request).
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from './App.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { LocaleProvider } from './lib/i18n.jsx';
import { ToastProvider } from './components/Toast.jsx';

export function render(path) {
  const html = renderToStaticMarkup(
    <StaticRouter location={path}>
      <LocaleProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </LocaleProvider>
    </StaticRouter>
  );
  return html;
}
