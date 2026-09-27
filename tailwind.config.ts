import type { Config } from 'tailwindcss'

// Nuvho brand tokens mirrored as Tailwind colours (nv-*), per nuvho-web-design §6.
// The design-system layer itself lives in app/globals.css (.nw-* marketing, .na-* admin,
// .nv-* primitives) so Figma values are reproduced exactly rather than approximated.
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // One approved breakpoint only (references/responsive.md): ≥901px is desktop.
    screens: {
      desk: '901px',
    },
    extend: {
      colors: {
        'nv-blue-slate':    '#28687F',
        'nv-blue-500':      '#3E7F96',
        'nv-steel-blue':    '#6BA1BF',
        'nv-tropical-teal': '#80B9BF',
        'nv-iron-grey':     '#414B4C',
        'nv-platinum':      '#E9EAEC',
        'nv-page':          '#F5F8F9',
        'nv-band':          '#F6F6F6',
        'nv-tint':          '#EEF4F5',
        'nv-slot':          '#E3EDF3',
        'nv-heading':       '#28687F',
        'nv-body':          '#414B4C',
        'nv-muted':         '#5E6B6C',
        'nv-meta':          '#8C9899',
        'nv-success':       '#4A8F6E',
        'nv-warning':       '#F3C65D',
        'nv-error':         '#982649',
        'nv-info':          '#6BA1BF',
      },
      fontFamily: {
        heading: ['var(--font-comfortaa)', 'system-ui', 'sans-serif'],
        body:    ['var(--font-raleway)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'nv-xs': '6px',
        'nv-md': '14px',
        'nv-lg': '16px',
        'nv-xl': '24px',
      },
    },
  },
  plugins: [],
}
export default config
