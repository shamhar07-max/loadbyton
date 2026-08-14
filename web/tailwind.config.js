/** Loadbyton Tailwind config — colors map onto the CSS custom properties
 * defined in src/index.css (mirrored from docs/brand/design-tokens.css).
 * Never hardcode a hex in a component; extend this scale instead. */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        raised: 'var(--bg-raised)',
        inverse: 'var(--bg-inverse)',
        border: {
          DEFAULT: 'var(--border-default)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          inverse: 'var(--text-inverse)',
          onaccent: 'var(--text-on-accent)',
        },
        brand: {
          primary: 'var(--brand-primary)',
          'primary-hover': 'var(--brand-primary-hover)',
          secondary: 'var(--brand-secondary)',
          accent: 'var(--brand-accent)',
          'accent-hover': 'var(--brand-accent-hover)',
        },
        status: {
          success: 'var(--status-success)',
          'success-bg': 'var(--status-success-bg)',
          warning: 'var(--status-warning)',
          'warning-bg': 'var(--status-warning-bg)',
          danger: 'var(--status-danger)',
          'danger-bg': 'var(--status-danger-bg)',
          info: 'var(--status-info)',
          'info-bg': 'var(--status-info-bg)',
        },
      },
      fontFamily: {
        display: ['Manrope', 'ui-sans-serif', 'sans-serif'],
        body: ['Inter', 'ui-sans-serif', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--lb-radius-sm)',
        md: 'var(--lb-radius-md)',
        lg: 'var(--lb-radius-lg)',
        xl: 'var(--lb-radius-xl)',
      },
      boxShadow: {
        sm: 'var(--lb-shadow-sm)',
        md: 'var(--lb-shadow-md)',
        lg: 'var(--lb-shadow-lg)',
        focus: 'var(--lb-shadow-focus)',
      },
      maxWidth: {
        content: '1400px',
      },
    },
  },
  plugins: [],
};
