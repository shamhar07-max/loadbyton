import React from 'react';
import { IconPackage, IconShield, IconClock, IconCheck } from './icons.jsx';

// Hero visual — replaces the old hub-and-spoke network diagram (deemed too
// flat/"infographic") with a small looping motion-graphic: a truck driving
// a scrolling highway at dusk, with a status chip cycling through a job's
// real lifecycle (posted -> verified -> escrow secured -> delivered) above
// it. Bolder and more atmospheric than the rest of the page on purpose —
// contained entirely inside its own dark card, using the same single
// accent color, so it reads as "the one deliberately vivid moment" rather
// than breaking the page's restraint elsewhere. Every motion is a CSS
// keyframe/transition, so the global prefers-reduced-motion rule in
// index.css collapses all of it to a single still frame for free.
const STAGES = [
  { Icon: IconPackage, label: 'Job posted' },
  { Icon: IconShield, label: 'Carrier verified' },
  { Icon: IconClock, label: 'Escrow secured' },
  { Icon: IconCheck, label: 'Delivered' },
];
const CYCLE_SECONDS = 8;

const BUILDINGS = [
  { x: 12, w: 18, h: 34 }, { x: 34, w: 12, h: 22 }, { x: 50, w: 16, h: 46 },
  { x: 70, w: 10, h: 18 }, { x: 84, w: 20, h: 30 }, { x: 108, w: 14, h: 40 },
  { x: 126, w: 10, h: 16 },
];

export default function FreightMotionScene() {
  return (
    <div className="freight-scene">
      <svg viewBox="0 0 400 190" className="freight-scene-svg" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Animated illustration of a truck driving a highway at dusk, with a job status cycling through posted, carrier verified, escrow secured, and delivered">
        <defs>
          <linearGradient id="fs-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15111f" />
            <stop offset="60%" stopColor="#3a1f14" />
            <stop offset="100%" stopColor="#F2600C" />
          </linearGradient>
          <radialGradient id="fs-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFB067" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#FFB067" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="fs-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF7A33" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FF7A33" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x="0" y="0" width="400" height="122" fill="url(#fs-sky)" />
        <circle cx="330" cy="34" r="46" fill="url(#fs-sun)" />
        <circle cx="330" cy="34" r="13" fill="#FFD9B0" opacity="0.85" />

        <g className="freight-scene-skyline">
          {[0, 152].map((offset) => (
            <g key={offset} transform={`translate(${offset},0)`}>
              {BUILDINGS.map((b, i) => (
                <rect key={i} x={b.x} y={122 - b.h} width={b.w} height={b.h} fill="#0A0A0B" opacity="0.85" />
              ))}
            </g>
          ))}
        </g>

        <rect x="0" y="122" width="400" height="68" fill="#0A0A0B" />
        <g className="freight-scene-lanes">
          <line x1="-60" y1="152" x2="460" y2="152" stroke="rgba(255,255,255,0.35)" strokeWidth="3" strokeDasharray="20 16" />
        </g>

        <ellipse className="freight-scene-glow" cx="200" cy="178" rx="70" ry="9" fill="url(#fs-glow)" />

        <g className="freight-scene-truck">
          <g className="freight-scene-wheel" style={{ transformOrigin: '158px 168px' }}>
            <circle cx="158" cy="168" r="8" fill="#111113" stroke="#3D3D42" strokeWidth="1.5" />
            <line x1="158" y1="161" x2="158" y2="175" stroke="#5A5A60" strokeWidth="1.5" />
          </g>
          <g className="freight-scene-wheel" style={{ transformOrigin: '224px 168px' }}>
            <circle cx="224" cy="168" r="8" fill="#111113" stroke="#3D3D42" strokeWidth="1.5" />
            <line x1="224" y1="161" x2="224" y2="175" stroke="#5A5A60" strokeWidth="1.5" />
          </g>
          <rect x="128" y="122" width="86" height="42" rx="3" fill="#F1F5F9" />
          <rect x="128" y="142" width="86" height="6" fill="#F2600C" />
          <line x1="205" y1="122" x2="205" y2="164" stroke="#94A3B8" strokeWidth="1" />
          <path d="M214,124 h20 l12,16 v24 h-32 Z" fill="#1C1C1F" />
          <path d="M220,130 h13 l7,10 h-20 Z" fill="#7DD3FC" opacity="0.85" />
          <circle className="freight-scene-headlight" cx="246" cy="158" r="4" fill="#FFE8C2" />
        </g>
      </svg>

      <div className="freight-scene-chips">
        {STAGES.map((s, i) => (
          <div
            key={s.label}
            className="freight-scene-chip"
            style={{ animationDelay: `${(i * CYCLE_SECONDS) / STAGES.length - CYCLE_SECONDS}s`, animationDuration: `${CYCLE_SECONDS}s` }}
          >
            <s.Icon size={14} /> {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
