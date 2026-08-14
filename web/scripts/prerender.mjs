// Build-time prerendering — runs after `vite build` (see package.json).
// Zero new dependencies: Vite's own programmatic SSR API (already a
// devDependency) loads src/entry-server.jsx through the same transform
// pipeline the dev server uses, so JSX/imports just work in this plain
// Node script. Written as .mjs specifically so it can use `import`
// directly without touching web/package.json's "type": "commonjs" —
// CLAUDE.md is explicit that flipping that breaks the Tailwind/PostCSS
// config, so this file opts into ESM on its own instead.
//
// Output: one static HTML fragment per public route, written to
// dist/__prerendered__/<slug>.html. server/index.js's renderSeoPage reads
// these and splices them into <div id="root"> for a session-less request.
// If this script never ran (or a route's fragment is missing), that splice
// is a no-op and the site serves exactly what it did before this existed —
// no crawlability upgrade, but nothing breaks either.

import { createServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

// Every public, unauthenticated route — the set a search crawler or a link
// preview bot actually needs real content for. Authenticated app pages are
// deliberately excluded: there's nothing to index behind a login wall.
const ROUTES = [
  { path: '/', slug: 'root' },
  { path: '/features', slug: 'features' },
  { path: '/pricing', slug: 'pricing' },
  { path: '/about', slug: 'about' },
  { path: '/security', slug: 'security' },
  { path: '/compliance', slug: 'compliance' },
  { path: '/blog', slug: 'blog' },
];

async function main() {
  const vite = await createServer({
    root: webRoot,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn',
  });

  const outDir = path.join(webRoot, 'dist', '__prerendered__');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const { render } = await vite.ssrLoadModule('/src/entry-server.jsx');
    for (const route of ROUTES) {
      const html = render(route.path);
      if (!html || html.length < 100) {
        throw new Error(`Prerendered output for ${route.path} looks empty (${html?.length ?? 0} chars) — refusing to write a near-blank fragment.`);
      }
      fs.writeFileSync(path.join(outDir, `${route.slug}.html`), html, 'utf8');
      console.log(`[prerender] ${route.path} -> ${html.length} chars`);
    }
  } finally {
    await vite.close();
  }
}

main().catch((err) => {
  // A prerender failure must fail the build loudly, not silently ship a
  // site with no crawlable content and no signal that anything's wrong.
  console.error('[prerender] failed:', err);
  process.exit(1);
});
