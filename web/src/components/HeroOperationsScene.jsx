import React from 'react';
import { IconPackage, IconSearch, IconTag, IconShield, IconTruck, IconMapPin, IconCheck, IconVault } from './icons.jsx';

// Hero visual — replaces the old FreightMotionScene (a truck driving a
// scrolling dusk highway, with a status chip cycling above it). That scene
// made the TRUCK the subject; the caption was just decoration on top of it.
// This one makes the COMMERCIAL TRANSACTION the subject: a load is created,
// the platform matches it against several carriers, one is selected and the
// terms are agreed, the shipment moves, and the transaction settles at
// delivery. The truck is one participant drawn on the route, not the scene.
//
// Everything here is plain SVG + CSS keyframes — no animation library, no
// JS timers — same approach the old scene used (see freight-scene-lanes'
// stroke-dashoffset trick, reused below for the route draw). CYCLE_SECONDS
// sets the shared --hs-cycle duration every .hs-* rule in index.css animates
// against. Each caption below has its OWN dedicated keyframe (.hs-chip-1
// .. .hs-chip-8 in index.css) hand-timed to the SAME narrative percentages
// as the network/route/vehicle rules — see the "Hero scene timeline" table
// at the top of that CSS section. Do not go back to one shared keyframe
// with per-chip animation-delay spacing them evenly: that was tried first
// and drifted out of sync with the SVG's uneven phase lengths (e.g. "In
// transit" is a third of the cycle, "Agreed" is a beat) — the caption for
// "Settled" ended up on screen during the SVG's invisible loop-reset.
const CYCLE_SECONDS = 20;

const STAGES = [
  { Icon: IconPackage, label: 'Load posted' },
  { Icon: IconSearch, label: 'Matching carriers' },
  { Icon: IconTag, label: 'Quote received' },
  { Icon: IconShield, label: 'Agreed' },
  { Icon: IconTruck, label: 'In transit' },
  { Icon: IconMapPin, label: 'Approaching destination' },
  { Icon: IconCheck, label: 'Delivered' },
  { Icon: IconVault, label: 'Settled' },
];

// Route is a flat spine from the origin node to the destination node; the
// matching cluster (junction + 3 carrier candidates) sits above it and is
// only relevant before the shipment departs.
const ORIGIN_X = 40;
const DEST_X = 360;
const ROUTE_Y = 150;
const JUNCTION_X = 170;
const ROUTE_LENGTH = DEST_X - ORIGIN_X; // matches the flat path's actual length

export default function HeroOperationsScene() {
  return (
    <div className="hero-scene" style={{ '--hs-cycle': `${CYCLE_SECONDS}s` }}>
      <svg
        viewBox="0 0 400 200"
        className="hero-scene-svg"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Animated diagram of a shipment's commercial lifecycle: a load is posted, the platform matches it against candidate carriers, terms are agreed, the shipment moves to its destination, delivery is confirmed, and the transaction settles"
      >
        {/* Matching cluster — junction plus three candidate carriers. Fades
            out once a carrier is selected and the shipment departs, so it
            doesn't compete with the route for attention during transit. */}
        <g className="hs-network">
          <line className="hs-line-reject" x1={JUNCTION_X} y1={ROUTE_Y} x2="120" y2="70" />
          <line className="hs-line-select" x1={JUNCTION_X} y1={ROUTE_Y} x2="170" y2="48" />
          <line className="hs-line-reject" x1={JUNCTION_X} y1={ROUTE_Y} x2="220" y2="70" />

          <circle className="hs-carrier hs-carrier-reject" cx="120" cy="70" r="7" />
          <circle className="hs-carrier hs-carrier-select" cx="170" cy="48" r="8" />
          <circle className="hs-carrier hs-carrier-reject" cx="220" cy="70" r="7" />

          <circle className="hs-junction" cx={JUNCTION_X} cy={ROUTE_Y} r="4" />
        </g>

        {/* Route — hidden until the shipment departs, drawn left-to-right as
            it travels, held complete through delivery/settlement, then
            reset to hidden while invisible (never an on-screen rewind). */}
        <line className="hs-route" x1={ORIGIN_X} y1={ROUTE_Y} x2={DEST_X} y2={ROUTE_Y} strokeDasharray={ROUTE_LENGTH} />

        {/* Origin */}
        <g className="hs-origin">
          <circle className="hs-node-ring" cx={ORIGIN_X} cy={ROUTE_Y} r="12" />
          <circle className="hs-node-dot" cx={ORIGIN_X} cy={ROUTE_Y} r="5" />
        </g>
        <g style={{ transform: `translate(${ORIGIN_X}px, ${ROUTE_Y - 26}px)`, transformBox: 'view-box' }}>
          <g className="hs-load-icon">
            <rect x="-8" y="-8" width="16" height="16" rx="2" />
          </g>
        </g>

        {/* Destination */}
        <g className="hs-destination">
          <circle className="hs-node-ring" cx={DEST_X} cy={ROUTE_Y} r="12" />
          <circle className="hs-node-dot" cx={DEST_X} cy={ROUTE_Y} r="5" />
        </g>
        <g style={{ transform: `translate(${DEST_X}px, ${ROUTE_Y - 26}px)`, transformBox: 'view-box' }}>
          <g className="hs-checkmark">
            <circle r="9" className="hs-checkmark-badge" />
            <path d="M-4,0 L-1,3.2 L4.5,-4" className="hs-checkmark-mark" />
          </g>
        </g>

        {/* Vehicle — travels the full route once a carrier is agreed; not the
            hero of the scene, just the participant that makes the movement
            visible. */}
        <g className="hs-vehicle">
          <g className="hs-wheel" style={{ transformOrigin: '-10px 10px' }}>
            <circle cx="-10" cy="10" r="4.5" />
          </g>
          <g className="hs-wheel" style={{ transformOrigin: '11px 10px' }}>
            <circle cx="11" cy="10" r="4.5" />
          </g>
          <rect x="-20" y="-6" width="30" height="16" rx="2" className="hs-vehicle-body" />
          <path d="M10,-6 h9 l6,8 v8 h-15 Z" className="hs-vehicle-cab" />
        </g>
      </svg>

      <div className="hero-scene-chips" aria-hidden="true">
        {STAGES.map((s, i) => (
          <div key={s.label} className={`hero-scene-chip hs-chip-${i + 1}`}>
            <s.Icon size={14} /> {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
