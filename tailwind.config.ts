import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Nuvho Brand Palette
        'blue-slate': '#28687F',
        'steel-blue': '#6BA1BF',
        'tropical-teal': '#80B9BF',
        'iron-grey': '#414B4C',
        'platinum': '#E9EAEC',
        'cherry-rose': '#982649',
        'deep-purple': '#672564',
        'wisteria': '#CEA8E6',
        'tuscan-sun': '#F3C65D',
        'taupe': '#A47F7B',
      },
      fontFamily: {
        'heading': ['Comfortaa', 'sans-serif'],
        'body': ['Raleway', 'sans-serif'],
      },
      borderRadius: {
        'nuvho': '14px',
      },
      boxShadow: {
        'nuvho': '0 2px 16px 0 rgba(40, 104, 127, 0.10), 0 0 0 1px rgba(128, 185, 191, 0.12)',
      },
    },
  },
  plugins: [],
}
export default config
