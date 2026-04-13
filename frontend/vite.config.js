import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("html2canvas")) {
            return "vendor-html2canvas";
          }

          if (id.includes("jspdf")) {
            return "vendor-jspdf";
          }

          if (id.includes("dompurify")) {
            return "vendor-dompurify";
          }

          if (id.includes("pptxgenjs")) {
            return "vendor-pptx";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
  },
});
