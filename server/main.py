#!/usr/bin/env python3
"""
Backend для качественного разделения аудио (Demucs).
Запуск: pip install -r requirements.txt && uvicorn main:app --reload
"""

import base64
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Audio Separation API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/health")
def health():
    ok, msg = check_demucs()
    return {"status": "ok" if ok else "error", "demucs": ok, "message": msg}


@app.post("/separate")
async def separate(file: UploadFile = File(...)):
    """Разделяет аудио на stems (drums, bass, other, vocals)."""
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

    workdir = Path(tempfile.mkdtemp())
    try:
        input_path = workdir / "input"
        input_path.mkdir()
        ext = Path(file.filename).suffix or ".wav"
        in_file = input_path / f"audio{ext}"
        content = await file.read()
        in_file.write_bytes(content)

        out_dir = workdir / "separated"
        out_dir.mkdir()

        stem_names_6 = ("drums", "bass", "other", "vocals", "guitar", "piano")
        stem_names_4 = ("drums", "bass", "other", "vocals")
        used_model = None
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
                used_model = model_name
                break
            if model_name == "htdemucs_6s":
                continue
            raise HTTPException(500, f"Demucs ошибка: {proc.stderr[:500]}")

        if not used_model:
            raise HTTPException(500, "Не удалось разделить аудио")

        model_dir = out_dir / used_model
        stem_names = stem_names_6 if used_model == "htdemucs_6s" else stem_names_4
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
            raise HTTPException(500, "Demucs не вернул stems")

        return result
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
