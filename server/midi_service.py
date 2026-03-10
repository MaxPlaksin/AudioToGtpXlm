"""
Конвертация аудио в MIDI через библиотеку sound-to-midi (tiagoft/audio_to_midi).
Монофоническая конвертация по каждому стему, результат — дорожки в формате API.
Импорт sound-to-midi выполняется лениво, чтобы сервер стартовал и без него.
"""

import tempfile
from pathlib import Path
from typing import Any

_CACHED_AVAILABLE: bool | None = None
_IMPORT_ERROR = ""

# Порядок и имена стемов для мультитрека
STEM_ORDER = ("vocals", "drums", "bass", "guitar", "piano", "other")


def is_available() -> bool:
    global _CACHED_AVAILABLE, _IMPORT_ERROR
    if _CACHED_AVAILABLE is not None:
        return _CACHED_AVAILABLE
    try:
        import librosa  # noqa: F401
        from sound_to_midi.monophonic import wave_to_midi  # noqa: F401
        _CACHED_AVAILABLE = True
        return True
    except Exception as e:
        _IMPORT_ERROR = str(e) if e else "unknown"
        _CACHED_AVAILABLE = False
        return False


def get_import_error() -> str:
    if _CACHED_AVAILABLE is None:
        is_available()
    return _IMPORT_ERROR


def _midi_to_track(midi_obj: Any, instrument: str) -> dict[str, Any]:
    """Извлекает ноты из midi (pretty_midi или midiutil через pretty_midi)."""
    notes: list[dict[str, Any]] = []
    if getattr(midi_obj, "instruments", None) is not None:
        for inst in midi_obj.instruments:
            for n in getattr(inst, "notes", []):
                notes.append({
                    "pitch": int(n.pitch),
                    "startTime": float(n.start),
                    "endTime": float(n.end),
                    "velocity": int(getattr(n, "velocity", 100)),
                })
        return {"instrument": instrument, "notes": notes}
    import io
    import pretty_midi
    buf = io.BytesIO()
    midi_obj.writeFile(buf)
    buf.seek(0)
    pm = pretty_midi.PrettyMIDI(buf)
    for inst in pm.instruments:
        for n in inst.notes:
            notes.append({
                "pitch": int(n.pitch),
                "startTime": float(n.start),
                "endTime": float(n.end),
                "velocity": int(getattr(n, "velocity", 100)),
            })
    return {"instrument": instrument, "notes": notes}


def convert_audio_to_midi_tracks(
    stems: dict[str, bytes],
    multi_track: bool = True,
) -> list[dict[str, Any]]:
    """
    Конвертирует аудио-буферы (WAV) в дорожки MIDI.
    stems: { "vocals": wav_bytes, "other": wav_bytes, ... }
    multi_track: если True — возвращает все STEM_ORDER (пустые при отсутствии стема);
                 если False — только дорожки с данными.
    Возвращает список { instrument, notes: [ { pitch, startTime, endTime, velocity } ] }.
    """
    if not is_available():
        raise RuntimeError(f"sound-to-midi недоступен: {get_import_error()}")

    import librosa
    from sound_to_midi.monophonic import wave_to_midi

    result_tracks: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory() as workdir:
        workdir_path = Path(workdir)
        for stem_name, wav_bytes in stems.items():
            if not wav_bytes:
                continue
            in_path = workdir_path / f"{stem_name}.wav"
            in_path.write_bytes(wav_bytes)
            try:
                y, sr = librosa.load(str(in_path), sr=None, mono=True)
                midi = wave_to_midi(y, srate=int(sr))
                track = _midi_to_track(midi, stem_name)
                result_tracks.append(track)
            except Exception:
                result_tracks.append({"instrument": stem_name, "notes": []})

    if multi_track:
        by_instrument = {t["instrument"]: t for t in result_tracks}
        ordered = [
            by_instrument.get(name, {"instrument": name, "notes": []})
            for name in STEM_ORDER
        ]
        return ordered
    return result_tracks
