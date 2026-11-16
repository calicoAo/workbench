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
          50: "#FFF1ED",
          100: "#F8DCD3",
          300: "#E8A596",
          500: "#B64F45"
        },
        lavender: {
          50: "#EEF1F8",
          200: "#CFD8EA"
        },
        indigo: {
          50: "#E9EFFB",
          100: "#CDD9F6",
          300: "#8BA2E8",
          500: "#496FC8",
          700: "#334E94"
        },
        gold: {
          50: "#FFF6E3",
          500: "#D69A2F",
          700: "#91651F"
        },
        cream: "#F2F6F3",
        ink: "#233B39",
        soft: "#596D69"
      },
      borderRadius: {
        card: "8px"
      },
      boxShadow: {
        glass: "0 10px 28px rgba(35, 59, 57, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
