import { useEffect, useRef, useState } from 'react';

// Zero-dependency scroll-reveal — an IntersectionObserver flips one class,
// the actual animation is a plain CSS transition (see .reveal/.reveal-visible
// in index.css). No GSAP: this repo's stated convention is "don't reach for
// a package where ~20 lines of stdlib/browser-API code does the job," and a
// fade+translateY reveal is exactly that. prefers-reduced-motion is already
// handled globally (index.css collapses all transition durations near-zero
// under that media query) — this hook doesn't need its own check.
export function useReveal({ threshold = 0.15, rootMargin = '0px 0px -80px 0px' } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No IntersectionObserver (very old browser, or a non-DOM environment
    // like build-time prerendering — see entry-server.jsx): show content
    // immediately rather than leaving it permanently at opacity:0.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { ref, visible };
}
