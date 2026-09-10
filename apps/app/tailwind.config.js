/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Mirrors apps/landing so the two surfaces stay one product.
      colors: { canvas: "#F4F0ED", ink: "#18161B", night: "#0A0B11" },
    },
  },
  plugins: [],
};
