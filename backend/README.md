# Backend: MIDI → Guitar Pro

FastAPI-сервис конвертации MIDI-дорожок в формат .gp5. Настроен по правилам из `.cursor/rules/backend.md`: слои, валидация, обработка ошибок, логирование.

## Структура

- **config.py** — настройки из env (лимиты, логи, CORS). Секреты не хардкодятся.
- **schemas.py** — Pydantic-модели с валидацией (лимиты треков/нот, диапазоны pitch/tempo).
- **errors.py** — типы исключений приложения для единообразных ответов API.
- **logging_config.py** — настройка логирования.
- **services/gtp_service.py** — бизнес-логика: построение Song и экспорт в .gp5. Одна ответственность.
- **main.py** — маршруты, middleware (request_id), обработчики исключений, health.

## Запуск

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Для конвертации в .gp5 нужна библиотека PyGuitarPro (указана в requirements.txt). Если она не установлена, `GET /health` вернёт `gtp: false`, а `POST /api/convert-to-gtp` — 501.

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `GTP_MAX_TRACKS` | 32 | Макс. число дорожек в одном запросе |
| `GTP_MAX_NOTES_PER_TRACK` | 10000 | Макс. нот на дорожку |
| `LOG_LEVEL` | INFO | Уровень логирования |
| `CORS_ORIGINS` | * | Разрешённые origins (через запятую) |

## Тесты

```bash
cd backend
pip install pytest
pytest tests/ -v
```

## API

- **GET /health** — статус сервиса и доступность PyGuitarPro. В ответе нет чувствительных данных.
- **POST /api/convert-to-gtp** — тело: `{ "tracks": [...], "tempo": 120 }`. Ответ: бинарный .gp5 (attachment).

Ошибки валидации возвращают 422. Ошибки приложения (501, 503) — JSON `{ "detail": "..." }`. Необработанные исключения логируются с request_id, клиенту возвращается 500 без раскрытия внутренних деталей.
