import asyncio
import logging
from datetime import datetime
from typing import Any, Callable

import pandas as pd
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential_jitter

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class AsyncNseLibClient:
    def __init__(self) -> None:
        self._semaphore = asyncio.Semaphore(max(1, int(settings.nselib_rate_limit_per_second)))
        self._last_call = 0.0
        self._min_interval = 1.0 / max(settings.nselib_rate_limit_per_second, 0.1)

    async def _pace(self) -> None:
        async with self._semaphore:
            now = asyncio.get_running_loop().time()
            wait_for = max(0.0, self._min_interval - (now - self._last_call))
            if wait_for:
                await asyncio.sleep(wait_for)
            self._last_call = asyncio.get_running_loop().time()

    async def call(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        await self._pace()
        return await self._call_with_retry(fn, *args, **kwargs)

    @retry(
        retry=retry_if_exception_type(Exception),
        wait=wait_exponential_jitter(initial=1, max=12),
        stop=stop_after_attempt(settings.nselib_max_attempts),
        reraise=True,
    )
    async def _call_with_retry(self, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        return await asyncio.to_thread(fn, *args, **kwargs)


def df_to_records(data: Any) -> list[dict[str, Any]]:
    if data is None:
        return []
    if isinstance(data, pd.DataFrame):
        frame = data.replace({pd.NA: None}).where(pd.notnull(data), None)
        return frame.to_dict(orient="records")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]
    return []


def pick(row: dict[str, Any], *names: str, default: Any = None) -> Any:
    lowered = {str(k).strip().lower().replace(" ", "_"): v for k, v in row.items()}
    for name in names:
        key = name.strip().lower().replace(" ", "_")
        if key in lowered and lowered[key] not in ("", "-", None):
            return lowered[key]
    return default


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(str(value).replace(",", ""))
    except Exception:
        return default


def as_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(float(str(value).replace(",", "")))
    except Exception:
        return default


def parse_nse_date(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    for fmt in ("%d-%b-%Y %H:%M:%S", "%d-%b-%Y", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return datetime.utcnow()


nselib_client = AsyncNseLibClient()
