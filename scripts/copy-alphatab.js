#!/usr/bin/env node
/**
 * Копирует AlphaTab из node_modules в public/alphatab для локальной раздачи
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'node_modules/@coderline/alphatab/dist');
const dest = path.join(root, 'public/alphatab');

function copyRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    console.warn('[copy-alphatab] Source not found:', srcDir);
    return;
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, name);
    const destPath = path.join(destDir, name);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(src)) {
  copyRecursive(src, dest);
  console.log('[copy-alphatab] Copied to public/alphatab');
} else {
  console.warn('[copy-alphatab] Run npm install first');
}
