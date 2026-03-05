"""
FastAPI бэкенд для Audio to GTP Converter.
Конвертация MIDI → GTP через библиотеку guitarpro.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Audio to GTP Converter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MidiNote(BaseModel):
    pitch: int
    startTime: float
    endTime: float
    velocity: int


class MidiTrack(BaseModel):
    instrument: str
    notes: List[MidiNote]
    program: Optional[int] = None


class ConvertRequest(BaseModel):
    tracks: List[MidiTrack]
    tempo: int = 120


@app.post("/api/convert-to-gtp")
async def convert_to_gtp(request: ConvertRequest):
    """
    Конвертирует MIDI-дорожки в GTP.
    Требует: pip install guitarpro
    См. документацию guitarpro для полной реализации.
    """
    try:
        import guitarpro as gp
        from io import BytesIO
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Библиотека guitarpro не установлена. Выполните: pip install guitarpro"
        )

    try:
        # guitarpro требует сложную структуру Song/Track/Voice/Beat
        # Для production см. https://github.com/lenormf/guitarpro
        song = gp.Song()
        song.tempo = request.tempo
        # Placeholder: создание минимальной структуры
        # Реализация зависит от версии guitarpro
        raise HTTPException(
            status_code=501,
            detail="GTP конвертация в разработке. Используйте экспорт MIDI и импортируйте в Guitar Pro."
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok"}
