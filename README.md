# Audio to GTP Converter

Приложение для разделения аудиотреков на инструменты и конвертации в MIDI для Guitar Pro.

**Сайт:** https://garanash.github.io/audioToGtp/

> ⚠️ **Однократная настройка:** Если сайт не открывается, включите GitHub Pages:  
> **Settings** → **Pages** → **Source:** Deploy from a branch → **Branch:** gh-pages → **/** (root)

## Архитектура

- **Фронтенд:** React + TypeScript + Vite
- **Стилизация:** Tailwind CSS + Framer Motion (дизайн Moises.ai)
- **Разделение на инструменты:** Demucs (Python backend) — полная модель HTDemucs. Fallback: demucs-web в браузере
- **Аудио → MIDI:** @spotify/basic-pitch (модель с CDN)
- **Плеер:** howler.js
- **MIDI:** midi-writer-js

## Запуск

**Полная установка (качественное разделение):**
```bash
npm run install-all   # npm install + Python venv + Demucs + модели
npm run dev           # Vite + backend на порту 8000
```

**Минимальная установка (разделение в браузере):**
```bash
npm install
npm run download-model
npm run dev
```

## Сборка

```bash
npm run build
```

## Структура проекта

```
├── .cursor/rules/          # Правила для Cursor AI
│   ├── design-system-moises.mdc
│   ├── audio-processor-arch.mdc
│   └── backend-gtp.mdc
├── src/
│   ├── components/         # UI компоненты
│   ├── hooks/              # React хуки
│   ├── types/              # TypeScript типы
│   └── utils/              # Утилиты
├── backend/                 # FastAPI для GTP (опционально)
└── public/models/          # WASM модели Demucs
```

## Поддерживаемые форматы

- Вход: MP3, WAV, FLAC, M4A (до 100 МБ)
- Выход: MIDI, GTP (через бэкенд)

## Детали

1. **Demucs (качественное разделение):** `npm run setup` создаёт Python venv и устанавливает demucs-infer. Backend на порту 8000 используется автоматически при запуске `npm run dev`.
2. **Demucs (браузерный fallback):** Модель (~172 МБ) скачивается с Hugging Face и кэшируется в IndexedDB.
2. **Basic Pitch:** Модель загружается с unpkg CDN автоматически.
3. **COOP/COEP:** Требуются для SharedArrayBuffer (ONNX). Настроены в `vite.config.ts` для dev/preview. Для production добавьте заголовки на уровне сервера.
4. **GTP:** Для конвертации MIDI → GTP запустите бэкенд: `cd backend && pip install fastapi uvicorn guitarpro && uvicorn main:app --reload`
