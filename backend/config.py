"""
Конфигурация backend из переменных окружения.
Секреты и лимиты не хардкодятся.
"""

import os
from typing import Final

# Лимиты запросов (защита от перегрузки и DoS)
MAX_TRACKS: Final[int] = int(os.environ.get("GTP_MAX_TRACKS", "32"))
MAX_NOTES_PER_TRACK: Final[int] = int(os.environ.get("GTP_MAX_NOTES_PER_TRACK", "10000"))
MIN_TEMPO: Final[int] = 1
MAX_TEMPO: Final[int] = 999
MIDI_PITCH_MIN: Final[int] = 0
MIDI_PITCH_MAX: Final[int] = 127
VELOCITY_MIN: Final[int] = 0
VELOCITY_MAX: Final[int] = 127

# Логирование
LOG_LEVEL: Final[str] = os.environ.get("LOG_LEVEL", "INFO").upper()
LOG_REQUEST_BODY: Final[bool] = os.environ.get("LOG_REQUEST_BODY", "0").strip().lower() in ("1", "true", "yes")

# CORS (в production сузить до конкретных origin)
CORS_ORIGINS: Final[str] = os.environ.get("CORS_ORIGINS", "*")
