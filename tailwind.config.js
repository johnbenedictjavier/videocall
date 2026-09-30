/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17211b',
        moss: '#2e6b4c',
        mint: '#e4f4e8',
        cream: '#fafbf7',
        coral: '#e98261',
        mist: '#eef2ee',
      },
      boxShadow: {
        soft: '0 18px 50px rgba(29, 48, 37, 0.08)',
        card: '0 8px 30px rgba(29, 48, 37, 0.07)',
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Manrope', 'ui-sans-serif', 'sans-serif'],
      },
      animation: {
        'float-slow': 'float 5s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 2.2s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.7', transform: 'scale(0.98)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
