import json
from typing import Any, Callable, Awaitable
import redis.asyncio as redis
from app.config import get_settings


settings = get_settings()
redis_client = redis.from_url(settings.redis_url, decode_responses=True)


async def get_json(key: str) -> Any | None:
    raw = await redis_client.get(key)
    if raw is None:
        return None
    return json.loads(raw)


async def set_json(key: str, value: Any, ttl: int) -> None:
    await redis_client.set(key, json.dumps(value, default=str), ex=ttl)


async def cached_json(key: str, ttl: int, loader: Callable[[], Awaitable[Any]]) -> Any:
    cached = await get_json(key)
    if cached is not None:
        return cached
    value = await loader()
    await set_json(key, value, ttl)
    return value
