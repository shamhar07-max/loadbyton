import React from 'react';
import { useReveal } from '../lib/motion.js';

// Below-the-fold scroll reveal — see index.css for why this is a separate
// mechanism from .animate-hero-in. `delay` is milliseconds, for staggering
// a row of siblings (e.g. delay={i * 60} in a .map()) without needing
// GSAP's stagger helper — a plain CSS transition-delay does the same job
// at this scale.
export function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children, ...props }) {
  const { ref, visible } = useReveal();
  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms`, ...style }}
      {...props}
    >
      {children}
    </Tag>
  );
}
