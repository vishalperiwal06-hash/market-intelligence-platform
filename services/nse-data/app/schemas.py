from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class ApiResponse(BaseModel):
    ok: bool = True
    data: Any
    meta: dict[str, Any] = Field(default_factory=dict)


class SymbolRecord(BaseModel):
    symbol: str
    name: str | None = None
    isin: str | None = None
    series: str | None = None
    sector: str | None = None
    industry: str | None = None
    instrument_type: str = "EQUITY"
    exchange: str = "NSE"
    is_fno: bool = False
    is_sme: bool = False
    is_etf: bool = False
    lot_size: int | None = None
    source: str = "nselib"


class QuoteRecord(BaseModel):
    symbol: str
    price: float = 0
    change: float = 0
    changePercent: float = 0
    volume: int = 0
    turnover: float = 0
    high: float = 0
    low: float = 0
    open: float = 0
    close: float = 0
    exchange: str = "NSE"
    timestamp: str
    source: str = "nselib"


class FilingRecord(BaseModel):
    exchange: str = "NSE"
    symbol: str
    companyName: str
    category: str
    subject: str
    details: str | None = None
    broadcastDate: datetime
    receiptDate: datetime
    pdfUrl: str | None = None
    attachmentName: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
