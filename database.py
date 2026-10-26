
import os
import asyncpg
from contextlib import asynccontextmanager
from fastapi import Request


@asynccontextmanager
async def lifespan(app):
    app.state.db_pool = await asyncpg.create_pool(
        dsn=os.environ["DATABASE_URL"],
        min_size=2,
        max_size=10,
    )
    try:
        yield
    finally:
        await app.state.db_pool.close()


async def get_async_db(request: Request):
    async with request.app.state.db_pool.acquire() as connection:
        yield connection
