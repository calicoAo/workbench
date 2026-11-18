import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mint: {
          50: "#EAF6F1",
          100: "#D1EBE1",
          300: "#8BC9B5",
          500: "#3B9C7E",
          700: "#226A57"
        },
        pink: {
          50: "#FCF0F6",
          100: "#F1D8E6",
          300: "#D5A2BE",
          500: "#B6577F"
        },
        lavender: {
          50: "#F4EFF9",
          200: "#DED1ED"
        },
        indigo: {
          50: "#F3EDF9",
          100: "#E2D5EF",
          300: "#BAA3CF",
          500: "#9279AB",
          700: "#73578D"
        },
        gold: {
          50: "#FFF6E3",
          500: "#D69A2F",
          700: "#91651F"
        },
        cream: "#F4F2F9",
        ink: "#4E4E67",
        soft: "#73718A"
      },
      borderRadius: {
        card: "16px"
      },
      boxShadow: {
        glass: "0 8px 30px rgba(95, 83, 125, 0.045)"
      }
    }
  },
  plugins: []
} satisfies Config;
