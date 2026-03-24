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
from app.routes.clients import router as clients_router
from app.routes.vendors import router as vendors_router
from app.routes.skus import router as skus_router
from app.routes.sales_orders import router as sales_orders_router
from app.routes.purchase_orders import router as purchase_orders_router
from app.routes.purchase_orders import generate_router as po_generate_router
from app.routes.fulfillment import router as fulfillment_router
from app.routes.pdf_parser import router as pdf_parser_router
from app.routes.users import router as users_router

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
app.include_router(clients_router)
app.include_router(vendors_router)
app.include_router(skus_router)
app.include_router(sales_orders_router)
app.include_router(purchase_orders_router)
app.include_router(po_generate_router)
app.include_router(fulfillment_router)
app.include_router(pdf_parser_router)
app.include_router(users_router)


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
    

# ── Run application ────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8080,
    )