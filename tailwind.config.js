/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: {
          blue: '#ff6d00',
          purple: '#7c3aed',
          pink: '#ffc400',
          green: '#ff6d00'
        },
        dark: {
          bg: '#07050f',
          surface: 'rgba(15, 8, 30, 0.80)',
          border: 'rgba(255, 109, 0, 0.20)'
        }
      },
      fontFamily: {
        mono: ['"Fira Code"', 'monospace'],
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      animation: {
        'glow-pulse': 'glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
        'grid-move': 'gridMove 15s linear infinite',
      },
      keyframes: {
        glow: {
          '0%, 100%': { opacity: 1, filter: 'drop-shadow(0 0 12px rgba(255, 109, 0, 0.9))' },
          '50%': { opacity: .5, filter: 'drop-shadow(0 0 3px rgba(255, 109, 0, 0.3))' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        gridMove: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(40px)' },
        }
      }
    },
  },
  plugins: [],
}
