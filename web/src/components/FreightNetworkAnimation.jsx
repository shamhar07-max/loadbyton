import React from 'react';

// Hero visual replacing the old "Lane Index — live" widget: an abstract
// hub-and-spoke network (not a literal map — UAE geography doesn't reduce
// cleanly to a small SVG, so this reads as an infographic, not cartography)
// representing the platform connecting Loadbyton to carriers/terminals
// across the four emirates it covers. Every animation is pure CSS
// (stroke-dashoffset, offset-path/offset-distance, opacity/transform
// keyframes) so the global `prefers-reduced-motion: reduce` block in
// index.css — which zeroes every animation/transition duration — covers
// this for free; nothing here needs its own reduced-motion branch.
const NODES = [
  { id: 'dubai', label: 'Dubai', x: 78, y: 76 },
  { id: 'sharjah', label: 'Sharjah', x: 322, y: 92 },
  { id: 'abudhabi', label: 'Abu Dhabi', x: 70, y: 246 },
  { id: 'fujairah', label: 'Fujairah', x: 326, y: 250 },
];
const HUB = { x: 200, y: 162 };

export default function FreightNetworkAnimation() {
  return (
    <div className="freight-net">
      <svg viewBox="0 0 400 320" className="freight-net-svg" role="img" aria-label="Animated diagram of Loadbyton's freight network connecting Dubai, Sharjah, Abu Dhabi and Fujairah">
        {NODES.map((n, i) => (
          <path
            key={`line-${n.id}`}
            className="freight-net-line"
            style={{ animationDelay: `${i * 0.35}s` }}
            d={`M ${HUB.x} ${HUB.y} L ${n.x} ${n.y}`}
          />
        ))}

        {NODES.slice(0, 2).map((n, i) => (
          <circle key={`pkt-${n.id}`} className="freight-net-packet" style={{ offsetPath: `path('M ${HUB.x} ${HUB.y} L ${n.x} ${n.y}')`, animationDelay: `${i * 1.6}s` }} r="3.5" />
        ))}

        <circle className="freight-net-hub-ring" cx={HUB.x} cy={HUB.y} r="16" />
        <circle className="freight-net-hub" cx={HUB.x} cy={HUB.y} r="9" />

        {NODES.map((n, i) => (
          <g key={n.id} style={{ animationDelay: `${i * 0.4}s` }} className="freight-net-node">
            <circle className="freight-net-node-ring" cx={n.x} cy={n.y} r="10" />
            <circle className="freight-net-node-dot" cx={n.x} cy={n.y} r="4.5" />
            <text x={n.x} y={n.y + 24} textAnchor="middle" className="freight-net-label">{n.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
