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
          blue: '#00f3ff',
          purple: '#b026ff',
          pink: '#ff007f',
          green: '#00ff66'
        },
        dark: {
          bg: '#05050f',
          surface: 'rgba(20, 20, 35, 0.6)',
          border: 'rgba(255, 255, 255, 0.1)'
        }
      },
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        sans: ['Inter', 'sans-serif'],
      },
      animation: {
        'glow-pulse': 'glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%, 100%': { opacity: 1, filter: 'drop-shadow(0 0 10px rgba(0, 243, 255, 0.8))' },
          '50%': { opacity: .5, filter: 'drop-shadow(0 0 2px rgba(0, 243, 255, 0.3))' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
}
