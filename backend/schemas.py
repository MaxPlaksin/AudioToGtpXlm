"""
Pydantic-схемы запросов и ответов с валидацией.
Все входные данные проверяются по типам и лимитам.
"""

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

try:
    from backend.config import (
        MAX_NOTES_PER_TRACK,
        MAX_TRACKS,
        MAX_TEMPO,
        MIN_TEMPO,
        MIDI_PITCH_MAX,
        MIDI_PITCH_MIN,
        VELOCITY_MAX,
        VELOCITY_MIN,
    )
except ImportError:
    from config import (
        MAX_NOTES_PER_TRACK,
        MAX_TRACKS,
        MAX_TEMPO,
        MIN_TEMPO,
        MIDI_PITCH_MAX,
        MIDI_PITCH_MIN,
        VELOCITY_MAX,
        VELOCITY_MIN,
    )


class MidiNoteIn(BaseModel):
    """Одна нота из запроса."""

    pitch: int = Field(..., ge=MIDI_PITCH_MIN, le=MIDI_PITCH_MAX, description="MIDI pitch 0–127")
    startTime: float = Field(..., ge=0, description="Время начала в секундах")
    endTime: float = Field(..., ge=0, description="Время конца в секундах")
    velocity: int = Field(100, ge=VELOCITY_MIN, le=VELOCITY_MAX, description="Скорость нажатия 0–127")

    @field_validator("endTime")
    @classmethod
    def end_time_after_start(cls, v: float, info) -> float:
        if "startTime" in info.data and v < info.data["startTime"]:
            raise ValueError("endTime не может быть меньше startTime")
        return v


class MidiTrackIn(BaseModel):
    """Одна дорожка из запроса."""

    instrument: str = Field(..., min_length=1, max_length=128, description="Название инструмента")
    notes: List[MidiNoteIn] = Field(..., max_length=MAX_NOTES_PER_TRACK)
    program: Optional[int] = Field(None, ge=0, le=127)


class ConvertRequest(BaseModel):
    """Тело запроса POST /api/convert-to-gtp."""

    tracks: List[MidiTrackIn] = Field(..., min_length=1, max_length=MAX_TRACKS)
    tempo: int = Field(120, ge=MIN_TEMPO, le=MAX_TEMPO, description="Темп в BPM")
    key: Optional[str] = Field(None, max_length=16, description="Тональность, например C, Am, F#")
