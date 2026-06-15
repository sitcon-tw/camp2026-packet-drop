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
        'net-bg':      '#0b0d0f',
        'net-surface': '#161b22',
        'net-raised':  '#1e2430',
        'net-wire':    '#252c38',
        'net-cyan':    '#006fff',
        'net-green':   '#07cf79',
        'net-red':     '#ef4444',
        'net-orange':  '#f59e0b',
        'net-yellow':  '#f59e0b',
        'net-blue':    '#3b82f6',
      },
      animation: {
        'slide-up':  'slideUp 0.25s ease-out',
        'shake':     'shake 0.35s ease-in-out',
        'fade-in':   'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%':   { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%':      { transform: 'translateX(-5px)' },
          '40%':      { transform: 'translateX(5px)' },
          '60%':      { transform: 'translateX(-3px)' },
          '80%':      { transform: 'translateX(3px)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
