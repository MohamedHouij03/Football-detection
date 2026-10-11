/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B1019',
        surface: '#111826',
        'surface-2': '#161F30',
        'surface-3': '#1C2638',
        border: 'rgba(184, 255, 69, 0.12)',
        'border-soft': 'rgba(255, 255, 255, 0.07)',
        lime: {
          DEFAULT: '#B8FF45',
          dim: 'rgba(184, 255, 69, 0.12)',
          soft: 'rgba(184, 255, 69, 0.28)',
        },
        ink: {
          1: '#F3F6F2',
          2: '#A7B0C2',
          3: '#6B7489',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(184,255,69,0.15), 0 8px 30px -8px rgba(184,255,69,0.25)',
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 40px -24px rgba(0,0,0,0.6)',
      },
      backgroundImage: {
        'grid-fade': 'linear-gradient(180deg, rgba(184,255,69,0.06), transparent 60%)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.35 },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
