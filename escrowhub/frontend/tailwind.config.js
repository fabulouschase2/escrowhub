/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        apple: {
          black: '#000000',
          dark: '#0A0D14',
          sapphire: '#0B132B',
          glass: 'rgba(255, 255, 255, 0.08)',
          glassHover: 'rgba(255, 255, 255, 0.12)',
          border: 'rgba(255, 255, 255, 0.10)',
          borderLight: 'rgba(255, 255, 255, 0.20)',
          blue: '#38BDF8',
          sky: '#0EA5E9',
          skyGlow: 'rgba(56, 189, 248, 0.25)',
          white: '#FFFFFF',
          muted: '#94A3B8',
          success: '#10B981',
          danger: '#EF4444',
          warning: '#F59E0B',
        }
      },
      backdropBlur: {
        'glass': '16px',
        'glass-lg': '24px',
        'glass-xl': '32px',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-sm': '0 4px 16px 0 rgba(0, 0, 0, 0.25)',
        'sky': '0 8px 32px rgba(56, 189, 248, 0.25)',
        'sky-sm': '0 4px 16px rgba(56, 189, 248, 0.15)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(56, 189, 248, 0.2)' },
          '100%': { boxShadow: '0 0 40px rgba(56, 189, 248, 0.4), 0 0 80px rgba(56, 189, 248, 0.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
}