import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from "node:path";
import wasm from 'vite-plugin-wasm';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), wasm()],
    build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "auth-callback": resolve(__dirname, "auth-callback.html"),
      },
    },
  },
})
