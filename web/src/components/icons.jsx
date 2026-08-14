// Small hand-rolled inline icon set — matches the documented convention
// (lucide-react is the aspirational convention but isn't installed; plain
// inline SVGs are used instead). Minimal, single-stroke, 20x20 default.
import React from 'react';

function Icon({ children, size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const IconMenu = (p) => <Icon {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Icon>;
export const IconClose = (p) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>;
export const IconBell = (p) => <Icon {...p}><path d="M6 8a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 12 6 8Z" /><path d="M9.5 17a2.5 2.5 0 0 0 5 0" /></Icon>;
export const IconChevronDown = (p) => <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>;
export const IconChevronRight = (p) => <Icon {...p}><path d="m9 6 6 6-6 6" /></Icon>;
export const IconArrowRight = (p) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
export const IconArrowLeft = (p) => <Icon {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></Icon>;
export const IconLogOut = (p) => <Icon {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Icon>;
export const IconCheck = (p) => <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>;
export const IconPackage = (p) => <Icon {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="M3 8l9 5 9-5M12 13v8" /></Icon>;
export const IconTruck = (p) => <Icon {...p}><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.7" /><circle cx="18" cy="18" r="1.7" /></Icon>;
export const IconShield = (p) => <Icon {...p}><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" /></Icon>;
export const IconClock = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Icon>;
export const IconMapPin = (p) => <Icon {...p}><path d="M20 10c0 5.5-8 12-8 12s-8-6.5-8-12a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.7" /></Icon>;
export const IconFile = (p) => <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Icon>;
export const IconStar = (p) => <Icon {...p}><path d="m12 3 2.6 5.9 6.4.6-4.9 4.2 1.5 6.3L12 16.9 6.4 20l1.5-6.3-4.9-4.2 6.4-.6L12 3Z" /></Icon>;
export const IconSettings = (p) => <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.2.6.7 1 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z" /></Icon>;
export const IconPlus = (p) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const IconSearch = (p) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Icon>;
export const IconUser = (p) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" /></Icon>;
export const IconAlert = (p) => <Icon {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 2.5 18a1.7 1.7 0 0 0 1.5 2.5h16a1.7 1.7 0 0 0 1.5-2.5L13.7 3.9a1.7 1.7 0 0 0-3.4 0Z" /></Icon>;
export const IconSun = (p) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>;
export const IconMoon = (p) => <Icon {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" /></Icon>;
export const IconMessage = (p) => <Icon {...p}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></Icon>;
export const IconTag = (p) => <Icon {...p}><path d="M12.6 2H4a2 2 0 0 0-2 2v8.6a2 2 0 0 0 .6 1.4l9 9a2 2 0 0 0 2.8 0l8-8a2 2 0 0 0 0-2.8l-9-9a2 2 0 0 0-1.4-.6Z" /><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" /></Icon>;
export const IconTrailer = (p) => <Icon {...p}><path d="M2 8h13v8H2z" /><path d="M15 12h4l3 2v2h-7z" /><circle cx="6" cy="18" r="1.6" /><circle cx="18.5" cy="18" r="1.6" /><path d="M2 8V6h9v2" /></Icon>;
export const IconLayers = (p) => <Icon {...p}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></Icon>;
export const IconCompass = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-6 2 2-6 6-2Z" /></Icon>;
export const IconInfo = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Icon>;
export const IconX = (p) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12" /></Icon>;
export const IconDownload = (p) => <Icon {...p}><path d="M12 3v12m0 0-4-4m4 4 4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Icon>;
export const IconUpload = (p) => <Icon {...p}><path d="M12 21V9m0 0-4 4m4-4 4 4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Icon>;
export const IconSparkle = (p) => <Icon {...p}><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></Icon>;
