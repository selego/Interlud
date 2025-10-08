import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        dark: "#95A39B",
        light: "#F5F8F6",
        primary: {
          DEFAULT: "#304436",
          light: "#535F57",
          lighter: "#95A39B",
          bright: "#92E3A9",
        },
        secondary: {
          DEFAULT: "#92E3A9",
        },
        purple: {
          DEFAULT: "#B691E3",
          dark: "#66468D",
          secondaryDarker: "#9274B6",
          medium: "#9274B6",
          light: "#EDE4F8",
        },
        blue: {
          DEFAULT: "#465FB1",
          light: "#EAEFFF",
        },
      },
      boxShadow: {
        header: "0 4px 0 0 rgba(86, 86, 86, 0.3)",
        outline: "4px 4px 0 0 #304436",
      },
      borderRadius: {
        primary: "4px",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
