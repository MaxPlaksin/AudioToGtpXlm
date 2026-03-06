#!/usr/bin/env node
/**
 * Копирует WASM-файлы ONNX Runtime в public/onnx-wasm для корректной загрузки
 * (избегаем SPA fallback, когда сервер отдаёт HTML вместо .wasm)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'node_modules/onnxruntime-web/dist');
const destDir = path.join(root, 'public/onnx-wasm');

const FILES = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
];

if (!fs.existsSync(srcDir)) {
  console.warn('[copy-onnx-wasm] Source not found:', srcDir);
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
for (const name of FILES) {
  const src = path.join(srcDir, name);
  const dest = path.join(destDir, name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('[copy-onnx-wasm] Copied', name);
  }
}
