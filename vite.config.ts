import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "near-nostr-sdk": resolve(__dirname, "../near-nostr-sdk/src/index.ts"),
    },
  },
});
