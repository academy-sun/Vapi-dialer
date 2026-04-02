import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // MX3 brand
        red:    { DEFAULT: "#E8002D", glow: "rgba(232,0,45,0.40)", lo: "rgba(232,0,45,0.18)" },
        cyan:   { DEFAULT: "#00C2FF" },
        green:  { DEFAULT: "#00D68F" },
        yellow: { DEFAULT: "#FFB800" },
        purple: { DEFAULT: "#A855F7" },
        // Dark surfaces
        surface: {
          1: "#060608",
          2: "#0E0E12",
          3: "#141418",
          4: "#1C1C22",
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      backdropBlur: {
        xs: "4px",
      },
      boxShadow: {
        glass:   "0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        "glow-red":   "0 0 24px rgba(232,0,45,0.40)",
        "glow-green": "0 0 20px rgba(0,214,143,0.35)",
        "glow-cyan":  "0 0 20px rgba(0,194,255,0.30)",
        card:  "0 4px 24px rgba(0,0,0,0.40)",
      },
      keyframes: {
        slideIn: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        bgShift: {
          "0%, 100%": { opacity: "1",  transform: "scale(1)" },
          "50%":      { opacity: ".7", transform: "scale(1.04)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 16px rgba(232,0,45,0.35)" },
          "50%":      { boxShadow: "0 0 32px rgba(232,0,45,0.60)" },
        },
      },
      animation: {
        slideIn:    "slideIn 0.22s cubic-bezier(.4,0,.2,1)",
        fadeIn:     "fadeIn 0.18s ease-out",
        fadeUp:     "fadeUp 0.4s cubic-bezier(.4,0,.2,1) both",
        bgShift:    "bgShift 18s ease-in-out infinite alternate",
        pulseGlow:  "pulseGlow 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
