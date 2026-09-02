/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        display: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-14px)' } },
        pop: { '0%': { transform: 'scale(.85)', opacity: 0 }, '100%': { transform: 'scale(1)', opacity: 1 } },
        slideUp: { '0%': { transform: 'translateY(14px)', opacity: 0 }, '100%': { transform: 'translateY(0)', opacity: 1 } },
        shimmer: { '0%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' }, '100%': { backgroundPosition: '0% 50%' } },
        ringPulse: { '0%,100%': { boxShadow: '0 0 0 0 rgba(168,85,247,.45)' }, '50%': { boxShadow: '0 0 0 18px rgba(168,85,247,0)' } },
        confettiFall: { '0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: 1 }, '100%': { transform: 'translateY(110vh) rotate(720deg)', opacity: 0 } },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        pop: 'pop .35s cubic-bezier(.34,1.56,.64,1) both',
        slideUp: 'slideUp .45s ease-out both',
        shimmer: 'shimmer 8s ease infinite',
        ringPulse: 'ringPulse 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
}
