module.exports = {
  mode: "jit",
  content: ["./src/**/*.js"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#361660",
          "light-purple": "#AD85E0",
          "bright-purple": "#925CD6",
        },
      },
    },
  },
  variants: {
    extend: {
      display: ["group-hover"],
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
