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
          blue: '#00ff41',
          purple: '#39ff14',
          pink: '#00e676',
          green: '#00ff41'
        },
        dark: {
          bg: '#000a00',
          surface: 'rgba(0, 18, 0, 0.75)',
          border: 'rgba(0, 255, 65, 0.18)'
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
          '0%, 100%': { opacity: 1, filter: 'drop-shadow(0 0 10px rgba(0, 255, 65, 0.9))' },
          '50%': { opacity: .5, filter: 'drop-shadow(0 0 2px rgba(0, 255, 65, 0.3))' },
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
