/** @type {import('tailwindcss').Config} */
export default {
  content: ['./public/**/*.html', './public/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Russo One"', 'sans-serif'],
        ui:      ['"Rajdhani"', 'sans-serif'],
      },
      colors: {
        ma: {
          gold:          '#c8943a',
          'gold-bright': '#e8b454',
          'gold-dim':    '#8a6225',
          steel:         '#7a8494',
          bg:            '#161820',
          panel:         '#21242d',
          'panel-light': '#2d3140',
          border:        '#3a3e50',
        },
      },
    },
  },
  plugins: [],
};
