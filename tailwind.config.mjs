/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sf: {
          bg: '#0f1117',
          surface: '#1a1d27',
          surfaceHover: '#252833',
          border: '#2a2d3a',
          primary: '#6366f1',
          primaryHover: '#818cf8',
          accent: '#22d3ee',
          success: '#22c55e',
          warning: '#f59e0b',
          danger: '#ef4444',
          text: '#e2e8f0',
          textSecondary: '#94a3b8',
          textMuted: '#64748b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
