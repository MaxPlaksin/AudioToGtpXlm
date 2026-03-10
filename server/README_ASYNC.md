# Асинхронное разделение (Celery + Redis)

Для быстрой и стабильной работы под нагрузкой разделение выполняется в фоне через Celery, результаты кешируются в Redis.

## Запуск

1. **Redis** (обязательно для async и кеша):
   ```bash
   # macOS
   brew install redis && brew services start redis
   # или докер: docker run -d -p 6379:6379 redis
   ```

2. **Зависимости**:
   ```bash
   pip install -r requirements.txt
   ```

3. **API** (из корня проекта):
   ```bash
   npm run server
   ```

4. **Воркер Celery** (отдельный терминал):
   ```bash
   npm run worker
   ```
   Или из `server/`: `celery -A celery_app worker -l info -c 2`

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `REDIS_URL` | `redis://127.0.0.1:6379/0` | Брокер и кеш |
| `CELERY_RESULT_BACKEND` | `redis://127.0.0.1:6379/1` | Результаты задач |
| `USE_CELERY` | `1` | `0` — только синхронный режим |
| `SEPARATION_CACHE_TTL` | `86400` | TTL кеша по хешу файла (сек) |
| `SEPARATION_RESULT_TTL` | `3600` | TTL результата по task_id (сек) |

## Поведение

- **POST /separate**: при включённом Redis сначала проверяется кеш по SHA256 файла; при попадании ответ сразу. Иначе задача ставится в очередь, возвращается `taskId`; фронт опрашивает `/separate/status/{taskId}` и `/separate/result/{taskId}`.
- **GET /health**: в ответе есть поля `async` и `cache` (доступность очереди и кеша).
- **Синхронный режим**: `POST /separate?sync=true` или работа без Redis — как раньше, ответ со stems в теле (под нагрузкой может быть медленно).

## Масштабирование

- Увеличить число воркеров: `celery -A celery_app worker -l info -c 4`.
- Один воркер обрабатывает одну задачу за раз (`worker_prefetch_multiplier=1`), чтобы не перегружать CPU.
- Кеш по хешу снижает повторные запуски Demucs для одного и того же файла.
