import os
import asyncpg
from dotenv import load_dotenv
from fastapi import Request

load_dotenv(".env")


async def connect_to_db(app):
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("DATABASE_URL is missing from .env")

    # asyncpg expects a standard PostgreSQL URL, not
    # SQLAlchemy's postgresql+asyncpg:// URL.
    database_url = database_url.replace(
        "postgresql+asyncpg://",
        "postgresql://",
        1,
    )

    app.state.db_pool = await asyncpg.create_pool(
        dsn=database_url,
        min_size=1,
        max_size=5,
    )


async def close_db_connection(app):
    pool = getattr(app.state, "db_pool", None)
    if pool is not None:
        await pool.close()


async def get_async_db(request: Request):
    pool = getattr(request.app.state, "db_pool", None)

    if pool is None:
        raise RuntimeError(
            "Database pool is not initialized. "
            "Check the FastAPI startup lifecycle."
        )

    async with pool.acquire() as connection:
        yield connection
