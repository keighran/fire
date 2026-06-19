"""
Test configuration — must run before any app module is imported.
Sets DATABASE_URL to SQLite so no PostgreSQL/Docker is needed for tests.
"""
from __future__ import annotations

import os

# Must be set before app.db is imported, which creates the engine at module level.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_wealth.db")
