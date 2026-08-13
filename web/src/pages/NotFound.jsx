import React from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../lib/seo.jsx';
import { Button } from '../components/ui.jsx';

export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-display text-6xl font-semibold" style={{ color: 'var(--brand-accent)' }}>404</p>
      <p className="mt-3 font-display text-xl font-semibold text-ink">This job code doesn't exist.</p>
      <p className="mt-1.5 max-w-sm text-sm text-ink-muted">The page you're looking for was moved, renamed, or never posted.</p>
      <Link to="/" className="mt-6"><Button>Back to home</Button></Link>
    </div>
  );
}
