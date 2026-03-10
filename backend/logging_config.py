"""
Настройка структурированного логирования.
Логи с контекстом (request_id) для трассировки.
"""

import logging
import sys

from config import LOG_LEVEL


def configure_logging() -> None:
    """Настраивает корневой логгер и формат сообщений."""
    level = getattr(logging, LOG_LEVEL, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        stream=sys.stdout,
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
