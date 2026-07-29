import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [preact()],

  // prevent vite from obscuring rust errors
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  // Restrict dependency scanning to only the src/ directory.
  // Vite 6 by default crawls ALL .html files in the project, which includes
  // the thousands of generated Rust doc HTML files in src-tauri/target/doc/,
  // causing EMFILE: too many open files errors and white screens on startup.
  optimizeDeps: {
    entries: ["index.html", "src/**/*.{js,ts,jsx,tsx,html}"],
    exclude: ["@tauri-apps/api", "@tauri-apps/plugin-dialog"],
  },
}));
