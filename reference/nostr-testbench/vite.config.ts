import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "near-nostr-sdk": resolve(__dirname, "../near-nostr-sdk/src/index.ts"),
    },
  },
});
