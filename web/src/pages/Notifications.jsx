import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { formatDateTime } from '../lib/constants.js';
import { Button, Card, EmptyState } from '../components/ui.jsx';
import { IconBell } from '../components/icons.jsx';

export default function Notifications() {
  usePageTitle('Notifications');
  const [items, setItems] = useState(null);

  function load() {
    api.notifications().then((d) => setItems(d.notifications)).catch(() => setItems([]));
  }
  useEffect(load, []);

  async function markRead() {
    await api.markNotificationsRead();
    load();
  }

  return (
    <div className="container-page py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Notifications</h1>
        {items && items.some((n) => !n.is_read) && <Button variant="secondary" onClick={markRead}>Mark all read</Button>}
      </div>

      <div className="mt-6">
        {items === null ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState icon={<IconBell size={26} />} title="No notifications" description="Bids, awards, status changes and payouts will show up here." />
        ) : (
          <Card className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            {items.map((n) => {
              const body = (
                <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ background: n.is_read ? 'transparent' : 'var(--bg-raised)' }}>
                  <div>
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    {n.body && <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>}
                  </div>
                  <p className="shrink-0 whitespace-nowrap text-xs text-ink-muted">{formatDateTime(n.created_at)}</p>
                </div>
              );
              return n.job_id ? (
                <Link key={n.id} to={`/jobs/${n.job_id}`} className="block hover:bg-raised">{body}</Link>
              ) : (
                <div key={n.id}>{body}</div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
