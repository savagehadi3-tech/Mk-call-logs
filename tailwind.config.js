/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          deep: "#095d7e",
          hover: "#074862",
          dark: "#05374a",
          light: "#eaf4f8",
          subtle: "#f3f8fa",
          border: "#c3dfeb",
        },
        matte: {
          bg: "#f8f9fa",
          card: "#ffffff",
          border: "#e7ebef",
          text: "#1e293b",
          muted: "#64748b",
        },
      },
      boxShadow: {
        soft: "0 2px 14px rgba(9, 93, 126, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)",
        "card-hover": "0 6px 24px rgba(9, 93, 126, 0.07), 0 2px 6px rgba(0, 0, 0, 0.03)",
        "teal-glow": "0 3px 12px rgba(9, 93, 126, 0.22)",
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "22px",
      },
    },
  },
  plugins: [],
};
