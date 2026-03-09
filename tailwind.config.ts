import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        ring: "rgb(var(--ring) / <alpha-value>)",

        brand: "rgb(var(--brand) / <alpha-value>)",
        "brand-2": "rgb(var(--brand-2) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",

        pine: "rgb(var(--card-2) / <alpha-value>)",
        "pine-2": "rgb(var(--bg-soft) / <alpha-value>)",
        sand: "rgb(var(--accent) / <alpha-value>)",
        "sand-2": "rgb(var(--muted) / <alpha-value>)",
      },
      boxShadow: {
        soft: "0 18px 45px -35px rgba(1,8,20,0.8)",
      },
    },
  },
  plugins: [],
};

export default config;