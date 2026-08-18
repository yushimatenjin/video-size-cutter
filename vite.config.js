import { defineConfig } from "vite";

// ffmpeg-core の wasm / js をビルド成果物に含めて自前ホストする。
// これにより外部CDNに依存せず、GitHub Pages の静的サイトでそのまま動作する。
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
  },
  server: {
    headers: {
      // SharedArrayBuffer 用（COOP/COEP）— ffmpeg.wasm の並列化で必要
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
