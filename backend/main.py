"""
FastAPI backend для конвертации MIDI → Guitar Pro (.gp5).
Следует правилам: слои, валидация, обработка ошибок, логирование.
Запуск: pip install -r requirements.txt && uvicorn main:app --reload
"""

import logging
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from config import CORS_ORIGINS
from errors import AppError, DependencyError
from logging_config import configure_logging
from schemas import ConvertRequest
from services.gtp_service import GTPUnavailableError, convert_to_gp5

configure_logging()
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Audio to GTP Converter API",
    description="Конвертация MIDI-дорожок в формат Guitar Pro (.gp5)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS.split(",") if "," in CORS_ORIGINS else [CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Добавляет request_id к каждому запросу для трассировки."""
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(AppError)
def app_error_handler(request: Request, exc: AppError):
    """Единообразный JSON для ошибок приложения."""
    request_id = getattr(request.state, "request_id", None)
    logger.warning(
        "AppError: %s (status=%s)",
        exc.message,
        exc.status_code,
        extra={"request_id": request_id},
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )


@app.exception_handler(Exception)
def unhandled_exception_handler(request: Request, exc: Exception):
    """Ловит необработанные исключения, не раскрывает внутренние детали."""
    request_id = getattr(request.state, "request_id", None)
    logger.exception(
        "Unhandled exception: %s",
        type(exc).__name__,
        extra={"request_id": request_id},
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Внутренняя ошибка сервера"},
    )


def _check_gtp_available() -> tuple[bool, str]:
    """Проверяет доступность библиотеки guitarpro. Возвращает (ok, message)."""
    try:
        from services.gtp_service import _GTP_AVAILABLE, _GTP_IMPORT_ERROR
        if _GTP_AVAILABLE:
            return True, ""
        return False, _GTP_IMPORT_ERROR or "PyGuitarPro не установлен"
    except Exception as e:
        return False, str(e)


@app.get("/health")
async def health():
    """
    Проверка доступности сервиса и зависимостей.
    Не возвращает чувствительных данных.
    """
    gtp_ok, gtp_msg = _check_gtp_available()
    return {
        "status": "ok" if gtp_ok else "degraded",
        "gtp": gtp_ok,
        "message": gtp_msg if not gtp_ok else None,
    }


@app.post("/api/convert-to-gtp")
async def convert_to_gtp(request: Request, body: ConvertRequest):
    """
    Конвертирует MIDI-дорожки в .gp5.
    Вход: JSON (tracks, tempo). Выход: бинарный файл .gp5.
    """
    request_id = getattr(request.state, "request_id", None)
    logger.info(
        "convert-to-gtp: tracks=%s, tempo=%s",
        len(body.tracks),
        body.tempo,
        extra={"request_id": request_id},
    )

    try:
        content = convert_to_gp5(body)
    except GTPUnavailableError as e:
        raise DependencyError(str(e), status_code=501)
    except ValueError as e:
        logger.warning("Validation in service: %s", e, extra={"request_id": request_id})
        raise AppError(str(e), status_code=400)

    filename = "converted.gp5"
    return Response(
        content=content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
