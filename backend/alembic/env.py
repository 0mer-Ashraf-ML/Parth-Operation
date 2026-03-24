"""
Alembic environment configuration.

This file tells Alembic:
  1. Where to find the database URL  (from app.config.settings)
  2. Where to find the model metadata (from app.models.Base)

Run migrations with:
    alembic revision --autogenerate -m "description"
    alembic upgrade head
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import settings

# Import Base AFTER all models are registered in app.models.__init__
from app.models import Base  # noqa: F401

# ── Alembic Config object ─────────────────────────────────
config = context.config

# Override the sqlalchemy.url from alembic.ini with the real value
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Set up Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# This is the MetaData object that Alembic will inspect to
# auto-generate migration scripts.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode — generate SQL without
    connecting to the database.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode — connect to the database
    and apply changes directly.
    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
