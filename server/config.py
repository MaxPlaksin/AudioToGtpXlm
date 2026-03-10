"""
Конфигурация backend: Redis, Celery, кеш.
Без REDIS_URL работает синхронный режим без кеша.
"""

import os

REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")
RESULT_BACKEND_URL = os.environ.get("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/1")

USE_CELERY = os.environ.get("USE_CELERY", "0").strip().lower() in ("1", "true", "yes")
CACHE_TTL_SECONDS = int(os.environ.get("SEPARATION_CACHE_TTL", "86400"))  # 24 часа
INPUT_TTL_SECONDS = 3600  # файл во входной очереди — 1 час
RESULT_TTL_SECONDS = int(os.environ.get("SEPARATION_RESULT_TTL", "3600"))  # результат по task_id — 1 час

CACHE_KEY_PREFIX = "sep:v1:"
INPUT_KEY_PREFIX = "input:"
RESULT_KEY_PREFIX = "result:"
STATUS_KEY_PREFIX = "status:"
