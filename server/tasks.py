"""
Фоновая задача: разделение аудио через Demucs в отдельном процессе.
Выполняется в Celery worker, не блокирует API.
"""

import base64
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from celery_app import celery_app
import redis

from config import (
    CACHE_KEY_PREFIX,
    CACHE_TTL_SECONDS,
    INPUT_KEY_PREFIX,
    RESULT_KEY_PREFIX,
    RESULT_TTL_SECONDS,
    STATUS_KEY_PREFIX,
)

STEM_NAMES_6 = ("drums", "bass", "other", "vocals", "guitar", "piano")
STEM_NAMES_4 = ("drums", "bass", "other", "vocals")


def _get_redis():
    from config import REDIS_URL
    return redis.from_url(REDIS_URL, decode_responses=False)


def _run_demucs(in_path: Path, out_dir: Path) -> tuple[str, list[str]]:
    """Запускает demucs, возвращает (used_model, stem_names)."""
    for model_name, stem_names in [("htdemucs_6s", STEM_NAMES_6), ("htdemucs", STEM_NAMES_4)]:
        cmd = [
            sys.executable, "-m", "demucs_infer",
            "-n", model_name,
            "--segment", "5" if model_name == "htdemucs_6s" else "7",
            "-d", "cpu",
            "-o", str(out_dir),
            str(in_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, timeout=900, text=True)
        if proc.returncode == 0:
            return model_name, list(stem_names)
    raise RuntimeError("Demucs не смог разделить аудио")


@celery_app.task(bind=True, name="tasks.run_separation")
def run_separation(self, task_id: str, content_hash: str | None, file_ext: str = ".wav"):
    """
    Читает входной файл из Redis input:{task_id}, запускает Demucs,
    сохраняет результат в result:{task_id} и при наличии content_hash — в кеш sep:v1:{hash}.
    """
    r = _get_redis()
    input_key = f"{INPUT_KEY_PREFIX}{task_id}"
    result_key = f"{RESULT_KEY_PREFIX}{task_id}"
    status_key = f"{STATUS_KEY_PREFIX}{task_id}"

    if not file_ext or not file_ext.startswith("."):
        file_ext = ".wav"

    try:
        r.set(status_key, "processing", ex=RESULT_TTL_SECONDS)
        raw = r.get(input_key)
        if not raw:
            r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
            return {"error": "Входные данные истекли или не найдены"}

        workdir = Path(tempfile.mkdtemp())
        try:
            in_dir = workdir / "input"
            in_dir.mkdir()
            in_file = in_dir / f"audio{file_ext}"
            in_file.write_bytes(raw)
            out_dir = workdir / "separated"
            out_dir.mkdir()

            used_model, stem_names = _run_demucs(in_file, out_dir)
            model_dir = out_dir / used_model
            stems_dir = model_dir / "audio"
            if not stems_dir.exists():
                candidates = list(model_dir.iterdir()) if model_dir.exists() else []
                stems_dir = candidates[0] if candidates else stems_dir

            result = {}
            for name in stem_names:
                p = stems_dir / f"{name}.wav"
                if p.exists():
                    result[name] = base64.b64encode(p.read_bytes()).decode("ascii")

            if len(result) < 2:
                r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
                return {"error": "Недостаточно stems"}

            import json
            result_json = json.dumps(result).encode("utf-8")
            r.setex(result_key, RESULT_TTL_SECONDS, result_json)
            r.set(status_key, "completed", ex=RESULT_TTL_SECONDS)

            if content_hash:
                cache_key = f"{CACHE_KEY_PREFIX}{content_hash}"
                r.setex(cache_key, CACHE_TTL_SECONDS, result_json)

            return {"ok": True, "stems_keys": list(result.keys())}
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
    except Exception:
        r.set(status_key, "failed", ex=RESULT_TTL_SECONDS)
        raise
