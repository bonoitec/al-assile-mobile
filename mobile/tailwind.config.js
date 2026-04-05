/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#040810',
          900: '#080c14',
          850: '#0d1120',
          800: '#111827',
          750: '#161f30',
          700: '#1e2a3a',
          600: '#2a3a52',
          500: '#3d5068',
          400: '#5a6e88',
          300: '#8a9ab0',
          200: '#b0bec5',
        },
        gold: {
          DEFAULT: '#D4A574',
          50:  '#fdf8f2',
          100: '#f9eddd',
          200: '#f2d9b8',
          300: '#e8c08a',
          400: '#dba660',
          500: '#D4A574',
          600: '#c8893a',
          700: '#a96e28',
          800: '#8B6914',
          900: '#6b500f',
          950: '#3d2d07',
        },
        brand: {
          gold: '#D4A574',
          'dark-gold': '#8B6914',
          bg: '#080c14',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.25s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
        'bounce-subtle': 'bounceSubtle 0.3s ease',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          from: { transform: 'translateY(-10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          from: { transform: 'scale(0.95)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.94)' },
        },
      },
    },
  },
  plugins: [],
};
