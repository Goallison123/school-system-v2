/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        institutional: {
          green: '#007A3D',
          greenDark: '#005A2D',
          greenLight: '#E8F5E9',
          blue: '#0284C7',
          blueDark: '#0369A1',
          blueLight: '#E0F2FE',
          amber: '#D97706',
          amberLight: '#FEF3C7',
          red: '#DC2626',
          redLight: '#FEE2E2',
          slate: '#0F172A',
          surface: '#F8FAFC',
          border: '#E2E8F0',
        },
        brand: {
          dark: '#0F172A',
          darker: '#020617',
          light: '#F8FAFC',
          accent: '#007A3D',
          border: '#E2E8F0',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
