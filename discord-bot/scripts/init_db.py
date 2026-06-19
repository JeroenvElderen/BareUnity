"""Initialize the TurboCraig PostgreSQL schema without Docker.

Usage:
    python scripts/init_db.py

Reads DATABASE_URL from .env. The URL may be either postgresql:// or
postgresql+asyncpg://; the script normalizes it for psycopg-compatible psql use
by shelling out to the local `psql` executable.
"""
from __future__ import annotations

import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

schema = Path(__file__).resolve().parents[1] / "database" / "schema.sql"
database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise SystemExit("DATABASE_URL is required in .env")

psql_url = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
subprocess.run(["psql", psql_url, "-f", str(schema)], check=True)
print(f"Initialized database schema from {schema}")
