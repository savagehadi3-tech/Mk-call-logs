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
        apple: {
          bg: "#f5f5f7",
          card: "#ffffff",
          subtle: "#fbfbfd",
          dark: "#1d1d1f",
          gray: "#86868b",
          lightGray: "#e5e5ea",
          border: "rgba(0, 0, 0, 0.08)",
          orange: {
            DEFAULT: "#ff9500",
            hover: "#e68500",
            light: "#fff4e6",
            border: "#fed7aa",
          },
        },
      },
      boxShadow: {
        apple: "0 2px 14px rgba(0, 0, 0, 0.04)",
        "apple-hover": "0 6px 20px rgba(0, 0, 0, 0.07)",
        "apple-orange": "0 2px 10px rgba(255, 149, 0, 0.25)",
      },
      borderRadius: {
        "2xl": "18px",
        "3xl": "24px",
      },
    },
  },
  plugins: [],
};
