import logging
import asyncio
from typing import Annotated

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from app.cache import redis_client
from app.config import get_settings
from app.kafka import kafka_publisher
from app.logging_config import configure_logging
from app.schemas import ApiResponse
from app.services import derivatives_service, filings_service, market_service, institutional_service

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Bazaar NSE Data Service",
    version="1.0.0",
    description="nselib-backed NSE universe, market data, derivatives and filings service.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    redis_ok = False
    try:
        redis_ok = bool(await redis_client.ping())
    except Exception:
        redis_ok = False
    return {"status": "ok" if redis_ok else "degraded", "redis": redis_ok}


@app.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/v1/universe", response_model=ApiResponse)
async def universe(refresh: bool = False) -> ApiResponse:
    records = await market_service.symbol_universe(refresh=refresh)
    return ApiResponse(data=records, meta={"count": len(records), "source": "nselib"})


@app.get("/api/v1/quotes", response_model=ApiResponse)
async def quotes(symbols: Annotated[str, Query(description="Comma-separated NSE symbols")]) -> ApiResponse:
    symbol_list = [symbol.strip().upper() for symbol in symbols.split(",") if symbol.strip()]
    records = await market_service.live_quotes(symbol_list)
    await redis_client.publish("market:stream:batch", __import__("json").dumps(records, default=str))
    return ApiResponse(data=records, meta={"count": len(records)})


@app.get("/api/v1/historical", response_model=ApiResponse)
async def historical(
    symbol: str,
    from_date: str | None = None,
    to_date: str | None = None,
    period: str | None = "1M",
) -> ApiResponse:
    records = await market_service.historical(symbol.upper(), from_date, to_date, period)
    return ApiResponse(data=records, meta={"count": len(records), "symbol": symbol.upper()})


@app.get("/api/v1/indices", response_model=ApiResponse)
async def indices() -> ApiResponse:
    records = await market_service.indices()
    await redis_client.publish("market:stream:indices", __import__("json").dumps(records, default=str))
    return ApiResponse(data=records, meta={"count": len(records)})


@app.get("/api/v1/indices/constituents", response_model=ApiResponse)
async def index_constituents(category: str = "BroadMarketIndices", name: str = "Nifty 50") -> ApiResponse:
    records = await market_service.index_constituents(category, name)
    return ApiResponse(data=records, meta={"count": len(records), "category": category, "name": name})


@app.get("/api/v1/filings", response_model=ApiResponse)
async def filings(
    symbol: str | None = None,
    category: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str | None = None,
) -> ApiResponse:
    records = await filings_service.corporate_filings(symbol, category, limit, offset, search)
    return ApiResponse(data=records, meta={"count": len(records), "limit": limit, "offset": offset})


@app.get("/api/v1/options/chain", response_model=ApiResponse)
async def option_chain(symbol: str, expiry: str | None = None) -> ApiResponse:
    data = await derivatives_service.option_chain(symbol, expiry)
    return ApiResponse(data=data)


@app.get("/api/v1/derivatives/participant-oi", response_model=ApiResponse)
async def participant_oi() -> ApiResponse:
    records = await derivatives_service.participant_oi()
    return ApiResponse(data=records, meta={"count": len(records)})


@app.get("/api/v1/derivatives/ban-list", response_model=ApiResponse)
async def ban_list() -> ApiResponse:
    records = await derivatives_service.ban_list()
    return ApiResponse(data=records, meta={"count": len(records)})


@app.get("/api/v1/market/fii-dii", response_model=ApiResponse)
async def fii_dii() -> ApiResponse:
    records = await institutional_service.fii_dii_activity()
    return ApiResponse(data=records, meta={"count": len(records)})


@app.get("/api/v1/market/deals", response_model=ApiResponse)
async def bulk_block_deals() -> ApiResponse:
    bulk = await institutional_service.bulk_deals()
    block = await institutional_service.block_deals()
    return ApiResponse(data={"bulk": bulk, "block": block})


@app.get("/api/v1/market/vix", response_model=ApiResponse)
async def india_vix(period: str = "1M") -> ApiResponse:
    records = await institutional_service.india_vix(period)
    return ApiResponse(data=records, meta={"count": len(records)})


@app.get("/api/v1/market/top-movers", response_model=ApiResponse)
async def top_movers() -> ApiResponse:
    data = await market_service.top_movers()
    return ApiResponse(data=data)


async def check_nselib_updates() -> None:
    import os
    import signal
    import asyncio
    
    await asyncio.sleep(15)  # Wait for startup diagnostics to settle
    while True:
        try:
            logger.info("Checking for RuchiTanmay/nselib upstream Git updates...")
            # Execute pip install --upgrade in background thread
            process = await asyncio.create_subprocess_exec(
                "pip", "install", "--upgrade", "git+https://github.com/RuchiTanmay/nselib.git",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()
            output = stdout.decode().strip()
            
            if "Successfully installed" in output or "Uninstalling nselib" in output:
                logger.warning(f"Successfully pulled new nselib upstream commit: {output}")
                logger.warning("Triggering graceful uvicorn self-reload to activate upgraded exchange library...")
                os.kill(os.getpid(), signal.SIGTERM)
            else:
                logger.info("nselib is already at the latest upstream Git commit.")
        except Exception as e:
            logger.warning(f"Failed to check for nselib Git updates: {e}")
            
        await asyncio.sleep(7200)  # Check every 2 hours


@app.on_event("startup")
async def startup() -> None:
    asyncio.create_task(check_nselib_updates())


@app.on_event("shutdown")
async def shutdown() -> None:
    kafka_publisher.flush()
    await redis_client.aclose()
