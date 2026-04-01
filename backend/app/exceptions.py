"""
Standardised application exceptions and FastAPI error handlers.

Every API error is returned in a consistent JSON shape:
{
    "success": false,
    "error": {
        "code": "ERROR_CODE",
        "message": "Human-readable description"
    }
}
"""

from fastapi import Request
from fastapi.responses import JSONResponse


# ── Base exception ─────────────────────────────────────────

class AppException(Exception):
    """Base class for all application-level errors."""

    def __init__(
        self,
        status_code: int = 500,
        detail: str = "An unexpected error occurred",
        error_code: str = "INTERNAL_ERROR",
        extra: dict | None = None,
    ):
        self.status_code = status_code
        self.detail = detail
        self.error_code = error_code
        self.extra = extra  # optional structured payload (e.g. linked SKU list)


# ── Concrete exceptions ───────────────────────────────────

class BadRequestException(AppException):
    def __init__(self, detail: str = "Bad request", error_code: str = "BAD_REQUEST"):
        super().__init__(status_code=400, detail=detail, error_code=error_code)


class UnauthorizedException(AppException):
    def __init__(self, detail: str = "Not authenticated", error_code: str = "UNAUTHORIZED"):
        super().__init__(status_code=401, detail=detail, error_code=error_code)


class ForbiddenException(AppException):
    def __init__(self, detail: str = "Access denied", error_code: str = "FORBIDDEN"):
        super().__init__(status_code=403, detail=detail, error_code=error_code)


class NotFoundException(AppException):
    def __init__(self, detail: str = "Resource not found", error_code: str = "NOT_FOUND"):
        super().__init__(status_code=404, detail=detail, error_code=error_code)


class ConflictException(AppException):
    def __init__(self, detail: str = "Resource conflict", error_code: str = "CONFLICT", extra: dict | None = None):
        super().__init__(status_code=409, detail=detail, error_code=error_code, extra=extra)


class ValidationException(AppException):
    def __init__(self, detail: str = "Validation failed", error_code: str = "VALIDATION_ERROR"):
        super().__init__(status_code=422, detail=detail, error_code=error_code)


# ── FastAPI exception handlers ─────────────────────────────

async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
    """Return a uniform JSON error body for every AppException."""
    error_body: dict = {"code": exc.error_code, "message": exc.detail}
    if exc.extra:
        error_body["details"] = exc.extra
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": error_body},
    )
