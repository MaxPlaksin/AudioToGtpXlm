"""
Сервис конвертации MIDI-дорожок в формат Guitar Pro (.gp5).
Единственная ответственность: принять валидные данные и вернуть bytes файла.
"""

import logging
from io import BytesIO

try:
    from backend.schemas import ConvertRequest
except ImportError:
    from schemas import ConvertRequest

logger = logging.getLogger(__name__)

_GTP_AVAILABLE = False
_GTP_IMPORT_ERROR = ""

try:
    import guitarpro
    from guitarpro.models import (
        Beat,
        BeatStatus,
        Duration,
        KeySignature,
        MeasureHeader,
        Note,
        NoteType,
        Song,
        TimeSignature,
        Track,
    )
    _GTP_AVAILABLE = True
except Exception as e:
    _GTP_AVAILABLE = False
    _GTP_IMPORT_ERROR = str(e) if e else "unknown"

KEY_TO_FIFTHS = {
    "C": (0, 0), "Am": (0, 1), "G": (1, 0), "Em": (1, 1), "D": (2, 0), "Bm": (2, 1),
    "A": (3, 0), "F#m": (3, 1), "E": (4, 0), "C#m": (4, 1), "B": (5, 0), "G#m": (5, 1),
    "F#": (6, 0), "D#m": (6, 1), "C#": (7, 0), "A#m": (7, 1),
    "F": (-1, 0), "Dm": (-1, 1), "Bb": (-2, 0), "Gm": (-2, 1), "Eb": (-3, 0), "Cm": (-3, 1),
    "Ab": (-4, 0), "Fm": (-4, 1), "Db": (-5, 0), "Bbm": (-5, 1),
    "Gb": (-6, 0), "Ebm": (-6, 1), "Cb": (-7, 0), "Abm": (-7, 1),
}

# Один такт в тиках (quarter = 960 в GP)
QUARTER_TIME = 960


class GTPUnavailableError(Exception):
    """Библиотека guitarpro не установлена или недоступна."""


def _seconds_to_ticks(seconds: float, tempo: int) -> int:
    """Переводит время в секундах в тики GP (четверть = 960)."""
    quarter_per_sec = tempo / 60.0
    quarters = seconds * quarter_per_sec
    return int(quarters * QUARTER_TIME)


def _build_song(request: ConvertRequest) -> Song:
    """Строит объект Song из валидированного запроса."""
    song = Song()
    song.tempo = request.tempo
    song.title = "Exported"
    song.measureHeaders.clear()
    song.tracks.clear()
    if getattr(request, "key", None) and request.key and request.key.strip():
        key_clean = request.key.strip()
        parsed = KEY_TO_FIFTHS.get(key_clean) or KEY_TO_FIFTHS.get(
            key_clean[0].upper() + key_clean[1:].lower() if len(key_clean) > 1 else key_clean
        )
        if parsed is not None:
            try:
                song.key = KeySignature(parsed)
            except Exception:
                pass

    # Вычисляем длительность в тиках по всем нотам
    max_end_ticks = 0
    for track_in in request.tracks:
        for n in track_in.notes:
            end_ticks = _seconds_to_ticks(n.endTime, request.tempo)
            if end_ticks > max_end_ticks:
                max_end_ticks = end_ticks

    # Минимум один такт 4/4
    measure_length = QUARTER_TIME * 4
    num_measures = max(1, (max_end_ticks + measure_length - 1) // measure_length)

    for i in range(num_measures):
        header = MeasureHeader()
        header.timeSignature = TimeSignature()
        header.timeSignature.numerator = 4
        header.timeSignature.denominator = Duration(4)
        if i == 0:
            header.start = 0
        else:
            header.start = i * measure_length
        song.measureHeaders.append(header)

    for idx, track_in in enumerate(request.tracks):
        track = Track(song)
        track.number = idx + 1
        track.name = track_in.instrument[:128]
        track.isPercussionTrack = track_in.instrument.lower() in ("drums", "ударные", "percussion")
        if track.isPercussionTrack:
            track.channel.channel = 9
        if track_in.program is not None:
            track.channel.instrument = track_in.program
        song.tracks.append(track)

    # Заполняем ноты по дорожкам
    for track_idx, track_in in enumerate(request.tracks):
        track = song.tracks[track_idx]
        for note_in in track_in.notes:
            start_ticks = _seconds_to_ticks(note_in.startTime, request.tempo)
            end_ticks = _seconds_to_ticks(note_in.endTime, request.tempo)
            duration_ticks = max(1, end_ticks - start_ticks)

            measure_index = start_ticks // measure_length
            if measure_index >= len(track.measures):
                continue
            measure = track.measures[measure_index]
            voice = measure.voices[0]

            beat_start = measure.header.start + (start_ticks % measure_length)
            duration = Duration.fromTime(duration_ticks)

            beat = Beat(voice)
            beat.start = beat_start
            beat.duration = duration
            beat.status = BeatStatus.normal
            voice.beats.append(beat)

            # Нота: value = лад на струне (0–24). Струна 1 = E4 (64), маппинг pitch -> лад
            note = Note(beat)
            note.type = NoteType.normal
            note.value = min(24, max(0, note_in.pitch - 64))
            note.velocity = note_in.velocity
            note.string = 1
            beat.notes.append(note)

    return song


def convert_to_gp5(request: ConvertRequest) -> bytes:
    """
    Конвертирует запрос в бинарное содержимое .gp5.
    Raises GTPUnavailableError если библиотека не установлена.
    """
    if not _GTP_AVAILABLE:
        raise GTPUnavailableError(
            "Библиотека PyGuitarPro не установлена. Выполните: pip install PyGuitarPro"
        )
    song = _build_song(request)
    buffer = BytesIO()
    guitarpro.write(song, buffer, version=(5, 1, 0))
    return buffer.getvalue()
