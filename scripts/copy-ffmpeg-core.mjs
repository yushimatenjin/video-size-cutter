// ffmpeg-core の wasm / js を public/ffmpeg に配置する。
// public/ffmpeg は gitignore されており、CI（deploy.yml）でも同等のコピーをしている。
// `npm run dev` でもエンジン読み込みが 404 にならないよう postinstall から呼ぶ。
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules", "@ffmpeg", "core", "dist", "esm");
const destDir = join(root, "public", "ffmpeg");

for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const src = join(srcDir, name);
  if (!existsSync(src)) {
    console.warn(`[copy-ffmpeg-core] skip (not found): ${src}`);
    continue;
  }
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, join(destDir, name));
  console.log(`[copy-ffmpeg-core] copied: ${name}`);
}
