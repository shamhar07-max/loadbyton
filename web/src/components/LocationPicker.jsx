import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Label, Input } from './ui.jsx';

// Free, no-API-key map stack: OpenStreetMap raster tiles + Nominatim (OSM's
// own free geocoder) for search and reverse-geocoding. Nominatim's usage
// policy caps this at ~1 request/second and asks for an identifiable
// caller — the debounce below keeps search well under that, and the
// Referer header the browser sends is Nominatim's documented way to
// identify a browser-side caller (no server-side proxy needed for this
// traffic level). https://operations.osmfoundation.org/policies/nominatim/
const UAE_CENTER = [24.4539, 54.3773];
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

function pinIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;background:#C81E3A;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 18],
  });
}

// label/value/onChange — value is { lat, lng, address } | null. Used by the
// job post/edit forms to optionally pin an exact pickup/delivery point
// alongside the existing terminal/area dropdowns (which still drive lane
// rate lookups — this is a precision add-on, not a replacement).
export default function LocationPicker({ label, value, onChange, hint }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;
    const map = L.map(mapElRef.current).setView(value?.lat ? [value.lat, value.lng] : UAE_CENTER, value?.lat ? 13 : 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng));
    mapRef.current = map;
    if (value?.lat) placeMarker(value.lat, value.lng);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function placeMarker(lat, lng) {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      markerRef.current = L.marker([lat, lng], { draggable: true, icon: pinIcon() })
        .addTo(map)
        .on('dragend', (e) => {
          const p = e.target.getLatLng();
          setPoint(p.lat, p.lng);
        });
    }
    map.setView([lat, lng], Math.max(map.getZoom(), 13));
  }

  async function setPoint(lat, lng) {
    placeMarker(lat, lng);
    onChange({ lat, lng, address: value?.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    try {
      const res = await fetch(`${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (data.display_name) onChange({ lat, lng, address: data.display_name });
    } catch {
      // Reverse geocoding is a nicety, not required — the pin itself
      // (lat/lng) is already saved via the optimistic onChange above.
    }
  }

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ae&limit=5`, {
          headers: { Accept: 'application/json' },
        });
        setResults(await res.json());
      } catch {
        setResults([]);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [query]);

  function selectResult(r) {
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    placeMarker(lat, lng);
    onChange({ lat, lng, address: r.display_name });
    setResults([]);
    setQuery('');
  }

  return (
    <div className="sm:col-span-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input placeholder="Search an address in the UAE (optional)…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-surface shadow-lg" style={{ borderColor: 'var(--border-default)' }}>
            {results.map((r) => (
              <li key={r.place_id}>
                <button type="button" className="block w-full px-3 py-2 text-left text-xs hover:bg-raised" onClick={() => selectResult(r)}>
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div ref={mapElRef} className="mt-2 h-48 w-full rounded-md" style={{ border: '1px solid var(--border-default)' }} />
      {value?.address && <p className="mt-1 text-xs text-ink-muted">📍 {value.address}</p>}
      <p className="mt-1 text-xs text-ink-muted">{hint || 'Search, or click/drag the pin on the map to set an exact point.'} Map data © OpenStreetMap contributors.</p>
    </div>
  );
}
