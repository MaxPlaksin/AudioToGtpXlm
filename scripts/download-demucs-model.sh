#!/bin/bash
# Скачивает и копирует модели для локального использования

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

OUTPUT_DIR="public/models"
mkdir -p "$OUTPUT_DIR"

echo "Копирование модели Basic Pitch..."
mkdir -p "$OUTPUT_DIR/basic-pitch"
cp -r node_modules/@spotify/basic-pitch/model/* "$OUTPUT_DIR/basic-pitch/" 2>/dev/null || echo "Basic Pitch: node_modules не найден, пропускаем"

MODEL_URL="https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx"
OUTPUT_FILE="$OUTPUT_DIR/htdemucs_embedded.onnx"

echo "Скачивание модели Demucs (~172 МБ)..."
if command -v curl &> /dev/null; then
  curl -L -o "$OUTPUT_FILE" "$MODEL_URL"
elif command -v wget &> /dev/null; then
  wget -O "$OUTPUT_FILE" "$MODEL_URL"
else
  echo "Установите curl или wget"
  exit 1
fi

echo "Готово: $OUTPUT_FILE"
