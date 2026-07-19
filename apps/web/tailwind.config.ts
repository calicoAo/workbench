import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mint: {
          50: "#F1FFF9",
          100: "#DDF8EE",
          300: "#8FE4C1",
          500: "#35C99A",
          700: "#168967"
        },
        pink: {
          50: "#FFF3F8",
          100: "#FFE1EC",
          300: "#F6A7C6",
          500: "#EA6FA3"
        },
        lavender: {
          50: "#F7F4FF",
          200: "#DDD3FF"
        },
        cream: "#FFFDF8",
        ink: "#263238",
        soft: "#6B7A80"
      },
      borderRadius: {
        card: "12px"
      },
      boxShadow: {
        glass: "0 18px 50px rgba(53, 201, 154, 0.14)"
      }
    }
  },
  plugins: []
} satisfies Config;
