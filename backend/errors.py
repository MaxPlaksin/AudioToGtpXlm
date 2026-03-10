"""
Исключения приложения для согласованной обработки в API.
Не логируем чувствительные данные в сообщениях.
"""


class AppError(Exception):
    """Базовое исключение приложения."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ValidationError(AppError):
    """Ошибка валидации входных данных (400)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=400)


class DependencyError(AppError):
    """Недоступна зависимость сервиса (501/503)."""

    def __init__(self, message: str, status_code: int = 503):
        super().__init__(message, status_code=status_code)
