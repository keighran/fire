import os
from typing import Generator

from dotenv import load_dotenv
from sqlmodel import Session, SQLModel, create_engine

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://wealth_user:wealth_pass@localhost:5432/wealth_tracker",
)

engine = create_engine(DATABASE_URL, echo=False)


def create_db_and_tables() -> None:
    # Schema is managed by Alembic migrations — do not call create_all here.
    pass


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
