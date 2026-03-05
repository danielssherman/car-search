import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bmw: {
          blue: "#1c69d4",
          dark: "#0a0a0a",
          card: "#141414",
          border: "#2a2a2a",
          muted: "#888888",
        },
      },
    },
  },
  plugins: [],
};
export default config;
