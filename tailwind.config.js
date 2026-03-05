/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0A0A0A',
        card: '#111111',
        'card-hover': '#1A1A1A',
        accent: '#8A2BE2',
        'accent-dark': '#4B0082',
        border: '#2A2A2A',
        'text-primary': '#E0E0E0',
        'text-secondary': '#A0A0A0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
