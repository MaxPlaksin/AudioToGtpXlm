#!/bin/bash
# Устанавливает всё необходимое для качественного разделения (Demucs)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
REQUIREMENTS="$PROJECT_DIR/server/requirements.txt"
VENV_DIR="$PROJECT_DIR/.venv"

echo "=== Установка backend для качественного разделения ==="

if [ ! -f "$REQUIREMENTS" ]; then
  echo "Ошибка: $REQUIREMENTS не найден"
  exit 1
fi

PYTHON="${PYTHON:-python3}"
if ! command -v python3 &> /dev/null; then
  PYTHON="python"
fi
if ! command -v "$PYTHON" &> /dev/null; then
  echo "Ошибка: Python не найден. Установите Python 3.10+ (python.org или brew install python)"
  exit 1
fi

echo "Создание виртуального окружения (.venv)..."
"$PYTHON" -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

echo "Установка Python-зависимостей (demucs, fastapi, uvicorn)..."
pip install --upgrade pip
pip install -r "$REQUIREMENTS"

echo ""
echo "Проверка Demucs..."
python -m demucs_infer --help > /dev/null && echo "Demucs установлен успешно" || { echo "Ошибка проверки Demucs"; exit 1; }

echo ""
echo "Готово. Для запуска: npm run dev"
