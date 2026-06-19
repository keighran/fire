from __future__ import annotations
"""
Module 3 â€” Live Pricing Engine
Fetches market prices from yfinance and CoinGecko and writes them back to Asset rows.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

import requests
import yfinance as yf
from sqlmodel import Session, select

from app.models import Asset, AccountType


class LivePricingEngine:
    @staticmethod
    def fetch_equity_prices(tickers: list[str]) -> dict[str, Decimal]:
        """
        Batch-fetch latest close prices from yfinance.
        Handles ASX (.AX), LSE (.L), NYSE/NASDAQ (bare ticker).
        Returns {ticker: price} for successfully fetched tickers.
        """
        if not tickers:
            return {}

        prices: dict[str, Decimal] = {}
        try:
            if len(tickers) == 1:
                data = yf.download(tickers[0], period="2d", progress=False, auto_adjust=True)
                if not data.empty:
                    last_close = data["Close"].iloc[-1]
                    if last_close and last_close > 0:
                        prices[tickers[0]] = Decimal(str(round(float(last_close), 4)))
            else:
                data = yf.download(tickers, period="2d", progress=False, auto_adjust=True)["Close"]
                for ticker in tickers:
                    try:
                        price = data[ticker].dropna().iloc[-1]
                        if price and price > 0:
                            prices[ticker] = Decimal(str(round(float(price), 4)))
                    except (KeyError, IndexError):
                        continue
        except Exception:
            pass

        return prices

    @staticmethod
    def update_equity_prices(db: Session) -> dict[str, Decimal]:
        """Fetch and persist prices for all BROKERAGE and SUPER assets."""
        assets = db.exec(
            select(Asset).where(
                Asset.category.in_([AccountType.BROKERAGE, AccountType.SUPER])
            )
        ).all()

        tickers = [a.ticker for a in assets if a.ticker != "CASH"]
        prices = LivePricingEngine.fetch_equity_prices(tickers)

        for asset in assets:
            if asset.ticker in prices:
                asset.current_price = prices[asset.ticker]
                asset.last_updated = datetime.utcnow()

        db.commit()
        return prices

    @staticmethod
    def get_fx_rate(from_currency: str, to_currency: str = "AUD") -> Optional[Decimal]:
        """Fetch FX rate via yfinance (replaces GOOGLEFINANCE currency lookup)."""
        if from_currency == to_currency:
            return Decimal("1.0")
        try:
            pair = f"{from_currency}{to_currency}=X"
            data = yf.download(pair, period="2d", progress=False, auto_adjust=True)
            if not data.empty:
                rate = data["Close"].dropna().iloc[-1]
                return Decimal(str(round(float(rate), 6)))
        except Exception:
            pass
        return None


class CryptoEngine:
    BASE_URL = "https://api.coingecko.com/api/v3"

    @staticmethod
    def fetch_coingecko_prices(
        ids: list[str],
        vs_currency: str = "aud",
        api_key: str = "",
    ) -> dict[str, Decimal]:
        """
        Fetch precision pricing from CoinGecko.
        ids: CoinGecko coin IDs, e.g. ["bitcoin", "ethereum", "solana"]
        """
        if not ids:
            return {}

        url = f"{CryptoEngine.BASE_URL}/simple/price"
        params = {"ids": ",".join(ids), "vs_currencies": vs_currency}
        headers = {}
        if api_key:
            headers["x-cg-demo-api-key"] = api_key

        try:
            response = requests.get(url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            return {
                k: Decimal(str(v[vs_currency]))
                for k, v in response.json().items()
                if vs_currency in v
            }
        except Exception:
            return {}

    @staticmethod
    def update_crypto_prices(db: Session, api_key: str = "") -> dict[str, Decimal]:
        """Fetch and persist prices for all CRYPTO assets."""
        assets = db.exec(
            select(Asset).where(Asset.category == AccountType.CRYPTO)
        ).all()

        # CoinGecko uses lowercase IDs like "bitcoin", "ethereum"
        ids = [a.ticker.lower() for a in assets]
        prices = CryptoEngine.fetch_coingecko_prices(ids, api_key=api_key)

        for asset in assets:
            key = asset.ticker.lower()
            if key in prices:
                asset.current_price = prices[key]
                asset.last_updated = datetime.utcnow()

        db.commit()
        return prices

