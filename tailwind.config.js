/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background:      "#000000",
        surface:         "#1C1C1E",
        surfaceElevated: "#2C2C2E",
        textPrimary:     "#FFFFFF",
        textSecondary:   "#8E8E93",
        positive:        "#30D158",
        negative:        "#FF453A",
        accent:          "#0A84FF",
      },
    },
  },
  plugins: [],
};
