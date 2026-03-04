"""
FastAPI application entry point.

Run locally with:
    uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.exceptions import AppException, app_exception_handler
from app.routes.auth import router as auth_router

# ── Create application ─────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Internal Operations & Finance Platform – REST API",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS (allow frontend dev server during development) ────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register error handlers ───────────────────────────────
app.add_exception_handler(AppException, app_exception_handler)

# ── Register routers ──────────────────────────────────────
app.include_router(auth_router)


# ── Health check ───────────────────────────────────────────
@app.get(
    "/health",
    tags=["System"],
    summary="Health check",
)
def health_check():
    """Returns the API status and version. Used by load balancers and monitoring."""
    return {
        "success": True,
        "data": {
            "status": "healthy",
            "version": settings.APP_VERSION,
        },
    }
