"""
Celery app: брокер и backend Redis.
Воркер: celery -A celery_app worker -l info -c 2
"""

from celery import Celery

from config import REDIS_URL, RESULT_BACKEND_URL

celery_app = Celery(
    "audio_separation",
    broker=REDIS_URL,
    backend=RESULT_BACKEND_URL,
    include=["tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    task_acks_late=True,
    task_time_limit=900,
    worker_prefetch_multiplier=1,
)
