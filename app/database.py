"""
Database engine, session factory, and dependency injection helper.

Usage in route handlers:
    from app.database import get_db
    @router.get("/example")
    def example(db: Session = Depends(get_db)):
        ...
"""

from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# ── Engine ─────────────────────────────────────────────────
# pool_pre_ping=True lets SQLAlchemy silently reconnect when
# the connection has been dropped (common with RDS idle timeout).
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=False,  # Set True to log all SQL (useful during development)
)

# ── Session factory ────────────────────────────────────────
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


# ── FastAPI dependency ─────────────────────────────────────
def get_db() -> Generator[Session, None, None]:
    """
    Yield a database session for a single request.
    The session is automatically closed after the request finishes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
