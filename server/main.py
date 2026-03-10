#!/usr/bin/env python3
"""
Backend: разделение аудио (Demucs) и API проектов пользователей.
Асинхронная обработка через Celery, кеш в Redis.
Запуск: pip install -r requirements.txt && uvicorn main:app --reload
Воркер: celery -A celery_app worker -l info -c 2
"""

import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response

# Доступ к backend (GTP) при запуске из корня репо или server/)
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
try:
    from backend.schemas import ConvertRequest
    from backend.services.gtp_service import GTPUnavailableError, convert_to_gp5
    _GTP_ROUTES_AVAILABLE = True
except Exception:
    _GTP_ROUTES_AVAILABLE = False

try:
    import redis
    from config import (
        CACHE_KEY_PREFIX,
        CACHE_TTL_SECONDS,
        INPUT_KEY_PREFIX,
        RESULT_KEY_PREFIX,
        STATUS_KEY_PREFIX,
        REDIS_URL,
        USE_CELERY,
    )
    REDIS_AVAILABLE = True
except Exception:
    REDIS_AVAILABLE = False
    USE_CELERY = False

try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    AUTH_AVAILABLE = True
except ImportError:
    AUTH_AVAILABLE = False

app = FastAPI(title="Audio Separation API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PROJECTS_DB = Path(__file__).resolve().parent / "data" / "projects.db"
UPLOADS_DIR = Path(__file__).resolve().parent / "data" / "uploads"


def get_user_id_from_token(authorization: str | None) -> str | None:
    """Извлекает и верифицирует Firebase ID token, возвращает uid или None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization[7:].strip()
    if not token or not AUTH_AVAILABLE:
        return None
    try:
        request = google_requests.Request()
        claims = id_token.verify_firebase_token(token, request)
        return claims.get("sub")
    except Exception:
        return None


def require_auth(authorization: str | None = Header(None, alias="Authorization")):
    """Зависимость: требует авторизацию, иначе 401."""
    uid = get_user_id_from_token(authorization)
    if not uid:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    return uid


def _init_db():
    PROJECTS_DB.parent.mkdir(parents=True, exist_ok=True)
    import sqlite3
    conn = sqlite3.connect(PROJECTS_DB)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    """)
    conn.commit()
    conn.close()


def _get_conn():
    import sqlite3
    _init_db()
    return sqlite3.connect(PROJECTS_DB)


def check_demucs() -> tuple[bool, str]:
    """Проверяет наличие Demucs (demucs-infer)."""
    try:
        r = subprocess.run(
            [sys.executable, "-m", "demucs_infer", "--help"],
            capture_output=True,
            timeout=10,
        )
        return r.returncode == 0, "" if r.returncode == 0 else r.stderr.decode()
    except FileNotFoundError:
        return False, "Python не найден"
    except subprocess.TimeoutExpired:
        return False, "Таймаут проверки"
    except Exception as e:
        return False, str(e)


def _redis_conn():
    if not REDIS_AVAILABLE:
        return None
    return redis.from_url(REDIS_URL, decode_responses=False)


def _run_demucs_sync(in_file: Path, out_dir: Path) -> tuple[str | None, list[str]]:
    """Запускает Demucs синхронно. Возвращает (used_model, stem_names)."""
    stem_names_6 = ("drums", "bass", "other", "vocals", "guitar", "piano")
    stem_names_4 = ("drums", "bass", "other", "vocals")
    for model_name, stem_names in [("htdemucs_6s", stem_names_6), ("htdemucs", stem_names_4)]:
        cmd = [
            sys.executable, "-m", "demucs_infer",
            "-n", model_name,
            "--segment", "5" if model_name == "htdemucs_6s" else "7",
            "-d", "cpu",
            "-o", str(out_dir),
            str(in_file),
        ]
        proc = subprocess.run(cmd, capture_output=True, timeout=900, text=True)
        if proc.returncode == 0:
            return model_name, list(stem_names)
        if model_name == "htdemucs_6s":
            continue
    return None, []


def _input_to_wav_bytes(in_path: Path) -> bytes:
    """Конвертирует входной файл в WAV (bytes). Для fallback при ошибке Demucs."""
    try:
        import numpy as np
        import soundfile as sf
        import librosa
        y, sr = librosa.load(str(in_path), sr=None, mono=True)
        wav_path = in_path.with_suffix(".wav")
        sf.write(str(wav_path), y, sr)
        return wav_path.read_bytes()
    except Exception:
        return b""


def _separate_sync(content: bytes, ext: str) -> dict[str, str]:
    """Синхронное разделение аудио в памяти. Возвращает { stem_name: base64 }.
    При ошибке Demucs возвращает одну дорожку "other" (оригинал в WAV), чтобы работала конвертация в MIDI.
    """
    workdir = Path(tempfile.mkdtemp())
    input_path = workdir / "input"
    input_path.mkdir()
    in_file = input_path / f"audio{ext}"
    in_file.write_bytes(content)
    out_dir = workdir / "separated"
    out_dir.mkdir()

    try:
        used_model, stem_names = _run_demucs_sync(in_file, out_dir)
        if not used_model:
            raise ValueError("Не удалось разделить аудио")

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
            raise ValueError("Demucs не вернул stems")
        return result
    except Exception as e:
        wav_bytes = _input_to_wav_bytes(in_file) if in_file.exists() else None
        if wav_bytes:
            return {"other": base64.b64encode(wav_bytes).decode("ascii")}
        raise HTTPException(500, str(e)[:400])
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


@app.get("/health")
def health():
    ok, msg = check_demucs()
    conn = _redis_conn()
    out = {
        "status": "ok" if ok else "error",
        "demucs": ok,
        "message": msg,
        "async": bool(REDIS_AVAILABLE and USE_CELERY),
        "cache": bool(REDIS_AVAILABLE),
    }
    if _GTP_ROUTES_AVAILABLE:
        try:
            from backend.services.gtp_service import _GTP_AVAILABLE
            out["gtp"] = _GTP_AVAILABLE
        except Exception:
            out["gtp"] = False
    return out


_BPM_DETECTOR_AVAILABLE = False
try:
    from bpm_detector import AudioAnalyzer
    _BPM_DETECTOR_AVAILABLE = True
except Exception:
    pass


@app.post("/detect-bpm")
async def detect_bpm(file: UploadFile = File(...)):
    """
    Определяет BPM и тональность из аудио (bpm-detector).
    Возвращает { bpm: float, key: str | null }. При недоступности библиотеки — 503.
    """
    if not _BPM_DETECTOR_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="bpm-detector не установлен. Выполните: pip install 'bpm-detector @ git+https://github.com/libraz/bpm-detector.git'",
        )
    if not file.filename or not any(
        file.filename.lower().endswith(ext) for ext in (".wav", ".mp3", ".flac", ".m4a", ".ogg")
    ):
        raise HTTPException(400, "Поддерживаются WAV, MP3, FLAC, M4A, OGG")
    ext = Path(file.filename).suffix or ".wav"
    content = await file.read()
    workdir = Path(tempfile.mkdtemp())
    try:
        path = workdir / f"audio{ext}"
        path.write_bytes(content)
        analyzer = AudioAnalyzer()
        results = analyzer.analyze_file(str(path), detect_key=True, comprehensive=False)
        basic = results.get("basic_info") or {}
        bpm = float(basic.get("bpm", 120))
        key = basic.get("key")
        if key is not None:
            key = str(key).strip() or None
        return {"bpm": round(bpm, 1), "key": key}
    except Exception as e:
        raise HTTPException(500, f"Ошибка анализа: {str(e)[:200]}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if _GTP_ROUTES_AVAILABLE:

    @app.post("/convert-to-gtp")
    async def convert_to_gtp(body: ConvertRequest):
        """Конвертирует MIDI-дорожки в .gp5. Тело: { tracks, tempo }. Ответ: файл .gp5."""
        try:
            content = convert_to_gp5(body)
        except GTPUnavailableError as e:
            raise HTTPException(status_code=501, detail=str(e))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return Response(
            content=content,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": 'attachment; filename="converted.gp5"',
                "Cache-Control": "no-store",
            },
        )


@app.post("/separate")
async def separate(
    file: UploadFile = File(...),
    sync: bool = Query(False, description="Принудительно синхронно (без очереди)"),
):
    """
    Разделяет аудио на stems. При включённом Celery возвращает taskId для опроса.
    При sync=true или без Redis — синхронный ответ со stems.
    """
    ok, _ = check_demucs()
    if not ok:
        raise HTTPException(
            status_code=503,
            detail="Demucs не установлен. Выполните: npm run setup",
        )

    if not file.filename or not any(
        file.filename.lower().endswith(ext) for ext in (".wav", ".mp3", ".flac", ".m4a")
    ):
        raise HTTPException(400, "Поддерживаются WAV, MP3, FLAC, M4A")

    content = await file.read()
    ext = Path(file.filename).suffix or ".wav"
    content_hash = hashlib.sha256(content).hexdigest()

    r = None
    try:
        r = _redis_conn()
        if r:
            cache_key = f"{CACHE_KEY_PREFIX}{content_hash}"
            cached = r.get(cache_key)
            if cached:
                return json.loads(cached.decode("utf-8"))
    except Exception:
        r = None

    use_async = USE_CELERY and REDIS_AVAILABLE and r and not sync
    if use_async:
        try:
            task_id = str(uuid.uuid4())
            input_key = f"{INPUT_KEY_PREFIX}{task_id}"
            status_key = f"{STATUS_KEY_PREFIX}{task_id}"
            r.setex(input_key, 3600, content)
            r.setex(status_key, 3600, b"pending")

            from tasks import run_separation
            run_separation.delay(task_id, content_hash, ext)

            return {"taskId": task_id, "status": "pending"}
        except Exception:
            pass

    result = _separate_sync(content, ext)
    if r:
        try:
            cache_key = f"{CACHE_KEY_PREFIX}{content_hash}"
            r.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(result).encode("utf-8"))
        except Exception:
            pass
    return result


@app.get("/separate/status/{task_id}")
def separate_status(task_id: str):
    """Статус задачи разделения: pending | processing | completed | failed."""
    if not REDIS_AVAILABLE:
        raise HTTPException(503, "Redis недоступен")
    r = _redis_conn()
    status_key = f"{STATUS_KEY_PREFIX}{task_id}"
    raw = r.get(status_key)
    if not raw:
        return {"taskId": task_id, "status": "unknown"}
    return {"taskId": task_id, "status": raw.decode("utf-8")}


@app.get("/separate/result/{task_id}")
def separate_result(task_id: str):
    """Результат задачи: JSON со stems (base64) или 202 если ещё не готов."""
    if not REDIS_AVAILABLE:
        raise HTTPException(503, "Redis недоступен")
    r = _redis_conn()
    result_key = f"{RESULT_KEY_PREFIX}{task_id}"
    raw = r.get(result_key)
    if not raw:
        status_key = f"{STATUS_KEY_PREFIX}{task_id}"
        st = r.get(status_key)
        if st and st.decode("utf-8") == "failed":
            raise HTTPException(500, "Задача завершилась с ошибкой")
        raise HTTPException(202, "Результат ещё не готов")
    return json.loads(raw.decode("utf-8"))


# --- Convert to MIDI (sound-to-midi) ---

try:
    try:
        from midi_service import (
            convert_audio_to_midi_tracks,
            get_import_error,
            is_available as midi_convert_available,
        )
    except ImportError:
        from server.midi_service import (
            convert_audio_to_midi_tracks,
            get_import_error,
            is_available as midi_convert_available,
        )
    _MIDI_CONVERT_AVAILABLE = midi_convert_available()
except Exception:
    _MIDI_CONVERT_AVAILABLE = False


@app.post("/convert-to-midi")
async def convert_to_midi(body: dict):
    """
    Конвертация аудио (WAV в base64) в MIDI-дорожки через sound-to-midi.
    Тело: { "stems": { "vocals": "<base64>", "other": "<base64>", ... }, "multiTrack": true }.
    Ответ: { "tracks": [ { "instrument": "vocals", "notes": [ { "pitch", "startTime", "endTime", "velocity" } ] } ] }.
    """
    if not _MIDI_CONVERT_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="sound-to-midi не установлен. Выполните: pip install sound-to-midi librosa",
        )
    stems_b64 = body.get("stems") or {}
    multi_track = body.get("multiTrack", True)
    if not isinstance(stems_b64, dict) or not stems_b64:
        raise HTTPException(400, "Нужно передать stems: объект с ключами (vocals, drums, ...) и base64 WAV.")
    stems_bytes = {}
    for key, b64 in stems_b64.items():
        if not b64 or not isinstance(b64, str):
            continue
        try:
            stems_bytes[key] = base64.b64decode(b64)
        except Exception:
            continue
    if not stems_bytes:
        raise HTTPException(400, "Не удалось декодировать ни один stem.")
    try:
        tracks = convert_audio_to_midi_tracks(stems_bytes, multi_track=multi_track)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, f"Ошибка конвертации: {str(e)[:200]}")
    return {"tracks": tracks}


# --- Projects API ---

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/projects")
def list_projects(user_id: str = Depends(require_auth)):
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT id, name, type, payload, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
        out = []
        for row in rows:
            pid, name, ptype, payload_str, created_at, updated_at = row
            payload = json.loads(payload_str) if payload_str else {}
            stem_count = len(payload.get("stem_files", []))
            duration = payload.get("duration")
            midi_count = len(payload.get("midi_files", []))
            notation_count = len(payload.get("notation_files", []))
            out.append({
                "id": pid,
                "name": name,
                "type": ptype,
                "createdAt": created_at,
                "updatedAt": updated_at,
                "stemCount": stem_count or None,
                "duration": duration,
                "midiCount": midi_count or None,
                "notationCount": notation_count or None,
            })
        return out
    finally:
        conn.close()


@app.get("/projects/{project_id}")
def get_project(project_id: str, user_id: str = Depends(require_auth)):
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT id, name, type, payload, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Проект не найден")
        pid, name, ptype, payload_str, created_at, updated_at = row
        payload = json.loads(payload_str) if payload_str else {}
        # camelCase для фронта
        if "stem_files" in payload and "stemFiles" not in payload:
            payload["stemFiles"] = payload.pop("stem_files", [])
        return {
            "id": pid,
            "userId": user_id,
            "name": name,
            "type": ptype,
            "createdAt": created_at,
            "updatedAt": updated_at,
            **payload,
        }
    finally:
        conn.close()


@app.post("/projects")
async def create_project(
    user_id: str = Depends(require_auth),
    name: str = Form(...),
    type: str = Form(...),
    duration: str = Form("0"),
    stems: list[UploadFile] = File(default=[]),
):
    if type != "separation" or not stems:
        raise HTTPException(400, "Для типа separation нужны файлы stems")
    project_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user_dir = UPLOADS_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    project_dir = user_dir / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    stem_files = []
    for f in stems:
        if not f.filename:
            continue
        safe_name = os.path.basename(f.filename)
        path = project_dir / safe_name
        content = await f.read()
        path.write_bytes(content)
        stem_files.append(safe_name)
    duration_num = float(duration) if duration else 0.0
    payload = {"stem_files": stem_files, "duration": duration_num}
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT INTO projects (id, user_id, name, type, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (project_id, user_id, name, type, json.dumps(payload), now, now),
        )
        conn.commit()
    finally:
        conn.close()
    return {
        "id": project_id,
        "userId": user_id,
        "name": name,
        "type": type,
        "stemFiles": stem_files,
        "duration": duration_num,
        "createdAt": now,
        "updatedAt": now,
    }


def get_user_from_header_or_query(
    authorization: str | None = Header(None, alias="Authorization"),
    token: str | None = Query(None),
):
    """Проверка токена из заголовка или query (для скачивания)."""
    uid = get_user_id_from_token(authorization)
    if not uid and token:
        uid = get_user_id_from_token(f"Bearer {token}")
    if not uid:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    return uid


@app.get("/projects/{project_id}/stems/{filename}")
def get_project_stem(
    project_id: str,
    filename: str,
    user_id: str = Depends(get_user_from_header_or_query),
):
    path = UPLOADS_DIR / user_id / project_id / filename
    if not path.is_file():
        raise HTTPException(404, "Файл не найден")
    return FileResponse(path, media_type="audio/wav", filename=filename)


@app.delete("/projects/{project_id}")
def delete_project(project_id: str, user_id: str = Depends(require_auth)):
    conn = _get_conn()
    try:
        cur = conn.execute("SELECT id FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        if not cur.fetchone():
            raise HTTPException(404, "Проект не найден")
        conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        conn.commit()
    finally:
        conn.close()
    project_dir = UPLOADS_DIR / user_id / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir, ignore_errors=True)
    return {"ok": True}
