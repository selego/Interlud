import tailwindcssAnimate from "tailwindcss-animate"

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px"
      }
    },
    extend: {
      gridTemplateColumns: {
        15: "repeat(15, minmax(0, 1fr))",
        16: "repeat(16, minmax(0, 1fr))"
      },

      colors: {
        // === Palette de couleurs principale ===

        // Vert (couleur primaire)
        green: {
          100: "#D9EFE3", // Vert clair de la palette
          500: "#2DAC6A" // Vert principal de la palette
        },

        // Teal/Cyan
        teal: {
          100: "#D2EDEC", // Cyan clair de la palette
          400: "#56BDB8" // Teal principal de la palette
        },

        // Gris/Slate (pour textes et backgrounds)
        slate: {
          700: "#0A3641" // Gris foncé de la palette
        },

        // Orange (couleur d'accent)
        orange: {
          50: "#FFF3E0",
          100: "#FFE0B2",
          200: "#FFCC80",
          300: "#FFB74D",
          400: "#FFA726",
          500: "#F59600", // Orange principal de la palette
          600: "#FB8C00",
          700: "#F57C00",
          800: "#EF6C00",
          900: "#E65100"
        },

        // === Aliases pour utilisation rapide ===
        "primary-green": "#2DAC6A",
        "secondary-green": "#D9EFE3",
        "primary-teal": "#56BDB8",
        "secondary-teal": "#D2EDEC",
        "primary-orange": "#F59600",
        "primary-slate": "#0A3641",
        "font-primary": "#123314",
        "primary-border": "#F59600",
        "deco-background-green": "#F9FFFC",
        "font-secondary": "#768776",
        "font-tertiary": "#768776",

        // === Couleurs système (shadcn/ui) ===
        background: {
          DEFAULT: "#FFFFFF",
          secondary: "#F5F5F5"
        },

        border: "#F59600",
        input: "#E0E0E0",
        ring: "#2DAC6A",
        foreground: "#263238",

        primary: {
          DEFAULT: "#2DAC6A",
          foreground: "#FFFFFF"
        },
        secondary: {
          DEFAULT: "#56BDB8",
          foreground: "#FFFFFF"
        },
        destructive: {
          DEFAULT: "#F44336",
          foreground: "#FFFFFF"
        },
        muted: {
          DEFAULT: "#F5F5F5",
          foreground: "#607D8B"
        },
        accent: {
          DEFAULT: "#F59600",
          foreground: "#FFFFFF"
        },
        popover: {
          DEFAULT: "#FFFFFF",
          foreground: "#263238"
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#263238"
        },
        table: {
          header: "#F5F5F5",
          border: "#E0E0E0"
        },

        // === Couleurs héritées (compatibilité) ===
        "blue-background": "#23394a",
        light: {
          border: "#e1e5e8",
          background: {
            DEFAULT: "#FFFFFF",
            blue: "#ecf5fe"
          },
          primary: {
            DEFAULT: "#027AF2",
            500: "#027AF2",
            400: "#3D99F4",
            100: "#D5E9FC",
            50: "#ECF5FE"
          },
          green: "#2DAC6A",
          orange: "#FF9800",
          red: "#f43c36",
          color: "#60768b"
        },
        dark: {
          border: "#435261"
        },
        purple: {
          DEFAULT: "#9C27B0",
          1: "#E1BEE7",
          2: "#CE93D8",
          3: "#AB47BC",
          4: "#8E24AA"
        },
        blue: {
          DEFAULT: "#2196F3"
        },
        lightyellow: "#FFBF54",
        lightblue: "#3E98F3",
        lightgreen: "#2DAC6A",
        lightred: "#FB6B69"
      },

      borderRadius: {
        lg: "12px",
        md: "8px",
        sm: "6px",
        DEFAULT: "8px"
      },

      fontFamily: {
        quicksand: ["Quicksand", "sans-serif"],
        "source-sans": ["Source Sans Pro", "sans-serif"],
        sans: ["Source Sans Pro", "sans-serif"]
      },

      fontSize: {
        "header-1": ["32px", { lineHeight: "1.2", fontWeight: "600" }],
        "header-1-alt": ["26px", { lineHeight: "1.2", fontWeight: "600" }],
        "header-3": ["22px", { lineHeight: "1.3", fontWeight: "600" }],
        title: ["18px", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["16px", { lineHeight: "1.5", fontWeight: "400" }],
        label: ["14px", { lineHeight: "1.4", fontWeight: "500" }]
      },

      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" }
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 }
        }
      },

      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out"
      }
    }
  },
  plugins: [tailwindcssAnimate]
}
