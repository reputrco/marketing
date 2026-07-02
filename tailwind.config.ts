import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Reputr brand
        brand: {
          DEFAULT: "#0052d0",
          dark: "#003d9e",
          soft: "#dae1ff",
          fixed: "#001849",
        },
        gold: { DEFAULT: "#f5b400", soft: "#fef3c7", ink: "#92400e" },
        grass: { DEFAULT: "#16a34a", soft: "#dcfce7", ink: "#15803d" },
        ink: { DEFAULT: "#191c1e", muted: "#434654", subtle: "#737686" },
        surface: {
          DEFAULT: "#f7f9fb",
          card: "#ffffff",
          sunk: "#eef1f4",
          line: "#dfe3e8",
        },
        danger: { DEFAULT: "#ba1a1a", soft: "#ffdad6" },
      },
      fontFamily: {
        display: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 8px rgba(25, 28, 30, 0.05)",
        elevated: "0 8px 24px rgba(25, 28, 30, 0.10)",
        brand: "0 8px 20px rgba(0, 82, 208, 0.25)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(145deg, #0052d0 0%, #003d9e 100%)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};

export default config;
