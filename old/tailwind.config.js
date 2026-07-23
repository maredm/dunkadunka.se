// tailwind.config.js
module.exports = {
  screens: {
    'sm': '640px',
    'md': '1080px',
    'lg': '1440px',
    'xl': '1920px',
  },
  content: ['./index.html', './waveform.html', './static/*.js'],
  theme: {
    colors: {
      'border': '#d1d5db',
    },
    extend: {},
  },
  plugins: [],
}