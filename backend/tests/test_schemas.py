"""
Unit-тесты валидации входных данных (схемы).
Один тест — одна проверка.
"""

import pytest
from pydantic import ValidationError

from backend.schemas import ConvertRequest, MidiNoteIn, MidiTrackIn


def test_valid_request_accepted():
    """Валидный запрос с одной дорожкой и одной нотой принимается."""
    req = ConvertRequest(
        tracks=[
            MidiTrackIn(
                instrument="vocals",
                notes=[
                    MidiNoteIn(pitch=60, startTime=0.0, endTime=0.5, velocity=100),
                ],
            ),
        ],
        tempo=120,
    )
    assert len(req.tracks) == 1
    assert req.tracks[0].instrument == "vocals"
    assert req.tempo == 120


def test_empty_tracks_rejected():
    """Пустой список дорожек отклоняется."""
    with pytest.raises(ValidationError):
        ConvertRequest(tracks=[], tempo=120)


def test_tempo_bounds():
    """Темп ограничен диапазоном 1–999."""
    with pytest.raises(ValidationError):
        ConvertRequest(
            tracks=[MidiTrackIn(instrument="x", notes=[MidiNoteIn(pitch=60, startTime=0, endTime=0.5)])],
            tempo=0,
        )
    with pytest.raises(ValidationError):
        ConvertRequest(
            tracks=[MidiTrackIn(instrument="x", notes=[MidiNoteIn(pitch=60, startTime=0, endTime=0.5)])],
            tempo=1000,
        )


def test_pitch_bounds():
    """Pitch в диапазоне 0–127."""
    with pytest.raises(ValidationError):
        MidiNoteIn(pitch=-1, startTime=0, endTime=0.5)
    with pytest.raises(ValidationError):
        MidiNoteIn(pitch=128, startTime=0, endTime=0.5)


def test_end_time_after_start():
    """endTime не может быть меньше startTime."""
    with pytest.raises(ValidationError):
        MidiNoteIn(pitch=60, startTime=1.0, endTime=0.5, velocity=100)
