import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        'blue-background': '#23394a',
        background: {
          DEFAULT: '#273237',
          secondary: '#f7f8fa'
        },
        light: {
          border: '#e1e5e8',
          background: {
            DEFAULT: '#FFFFFF',
            blue: '#ecf5fe'
          },
          primary: {
            DEFAULT: '#027AF2',
            500: '#027AF2',
            400: '#3D99F4',
            100: '#D5E9FC',
            50: '#ECF5FE'
          },
          green: '#00b83d',
          orange: '#ffb029',
          red: '#f43c36',
          color: '#60768b'
        },
        dark: {
          border: '#435261'
        },

        border: '#435261',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'hsl(var(--primary-foreground))',
          light: '#027af2'
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'var(--muted-foreground)'
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        table: {
          header: 'var(--table-header)',
          border: 'var(--table-border)'
        },
        purple: {
          DEFAULT: 'var(--purple)',
          1: 'var(--purple-1)',
          2: 'var(--purple-2)',
          3: 'var(--purple-3)',
          4: 'var(--purple-4)'
        },

        blue: {
          DEFAULT: 'var(--blue)'
        },

        lightyellow: '#FFBF54',
        lightblue: '#3E98F3',
        lightgreen: '#43CA78',
        lightred: '#FB6B69'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      },
      fontFamily: {
        'space-grotesk': 'var(--font-space-grostesk)'
      }
    }
  },
  plugins: [tailwindcssAnimate]
}
