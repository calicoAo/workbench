import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mint: {
          50: "#ECFCF9",
          100: "#CBF4ED",
          300: "#99E7DC",
          500: "#78D9D0",
          700: "#3A7F79"
        },
        pink: {
          50: "#FFF1F6",
          100: "#F8DFE9",
          300: "#E8AFC8",
          500: "#9F5A7E"
        },
        lavender: {
          50: "#F5F1FF",
          200: "#D0C4F0"
        },
        indigo: {
          50: "#E1F4FF",
          100: "#AADFF7",
          300: "#94A9FF",
          500: "#7C8CFF",
          700: "#4C5C9E"
        },
        gold: {
          50: "#FBE7A8",
          500: "#E1AC4F",
          700: "#B97938"
        },
        cream: "#F7FAFD",
        ink: "#29324B",
        soft: "#566179"
      },
      borderRadius: {
        card: "12px"
      },
      boxShadow: {
        glass: "0 18px 52px rgba(41, 50, 75, 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;
