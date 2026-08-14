import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { usePageTitle } from '../lib/seo.jsx';
import { formatDateTime } from '../lib/constants.js';
import { Button, Card, EmptyState } from '../components/ui.jsx';
import { IconBell } from '../components/icons.jsx';
import { useToasts } from '../components/Toast.jsx';

const TYPE_LABELS = {
  bid: 'New bids',
  award: 'Bid accepted / rejected',
  status: 'Shipment status updates',
  payout: 'Payouts',
  dispute: 'Disputes',
  verification: 'Carrier verification',
  message: 'Messages',
};

export default function Notifications() {
  usePageTitle('Notifications');
  const [items, setItems] = useState(null);
  const [prefs, setPrefs] = useState(null);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const { addToast } = useToasts();

  function load() {
    api.notifications().then((d) => setItems(d.notifications)).catch(() => setItems([]));
  }
  useEffect(load, []);
  useEffect(() => {
    api.notificationPreferences().then(setPrefs).catch(() => setPrefs({ types: [], disabled: [] }));
  }, []);

  async function markRead() {
    await api.markNotificationsRead();
    load();
  }

  async function toggleType(type) {
    const disabled = prefs.disabled.includes(type)
      ? prefs.disabled.filter((t) => t !== type)
      : [...prefs.disabled, type];
    setPrefs({ ...prefs, disabled });
    setPrefsBusy(true);
    try {
      await api.updateNotificationPreferences(disabled);
    } catch (err) {
      addToast({ type: 'system_message', title: 'Could not save preference', body: err.message });
      load();
    } finally {
      setPrefsBusy(false);
    }
  }

  return (
    <div className="container-page py-10" dir="ltr">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink">Notifications</h1>
        {items && items.some((n) => !n.is_read) && <Button variant="secondary" onClick={markRead}>Mark all read</Button>}
      </div>

      {prefs && prefs.types.length > 0 && (
        <Card className="mt-6">
          <Card.Content>
            <p className="text-sm font-medium text-ink">Notify me about</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {prefs.types.map((type) => (
                <label key={type} className="flex items-center gap-2 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={!prefs.disabled.includes(type)}
                    disabled={prefsBusy}
                    onChange={() => toggleType(type)}
                  />
                  {TYPE_LABELS[type] || type}
                </label>
              ))}
            </div>
          </Card.Content>
        </Card>
      )}

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
