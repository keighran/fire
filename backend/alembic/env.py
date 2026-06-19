import os
import sys
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

load_dotenv()

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Import all models so SQLModel.metadata is populated
from app.models import (  # noqa: F401
    Account,
    Asset,
    MonthlySnapshot,
    Transaction,
    User,
    UserSettings,
)

config = context.config

config.set_main_option(
    "sqlalchemy.url",
    os.getenv("DATABASE_URL", "postgresql://wealth_user:wealth_pass@localhost:5432/wealth_tracker"),
)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
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
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
