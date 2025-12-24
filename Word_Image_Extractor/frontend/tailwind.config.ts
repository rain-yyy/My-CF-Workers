import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        accent: {
          50: "#e7f8f4",
          100: "#c0f0e4",
          200: "#8ee0cf",
          300: "#57cbb5",
          400: "#29b69c",
          500: "#0b9b82",
          600: "#04826e",
          700: "#016957",
          800: "#024b3d",
          900: "#033429"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 10px 70px rgba(16, 185, 129, 0.25)"
      },
      backgroundImage: {
        "grid-slate":
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)"
      }
    }
  },
  plugins: []
};

export default config;

