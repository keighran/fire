from __future__ import annotations
"""
Module 6 â€” Australian Tax & Compliance Engine
Implements:
  - FIFO CGT calculator with s115-100 ITAA97 50% discount
  - Dividend franking credit gross-up (30% corporate rate)
  - CGT future liability estimation
"""
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from app.models import Asset, Transaction, TransactionType


@dataclass
class FIFOLot:
    """A single BUY parcel sitting in the FIFO queue."""
    date: datetime
    units: Decimal
    cost_base_per_unit: Decimal  # (price + fees) / units


@dataclass
class CGTEvent:
    """One disposal event produced by the FIFO calculator."""
    asset_ticker: str
    sell_date: datetime
    buy_date: datetime
    units_disposed: Decimal
    cost_base: Decimal
    gross_proceeds: Decimal
    gross_gain: Decimal
    holding_days: int
    discount_applied: bool
    taxable_gain: Decimal
    tax_year: str


@dataclass
class CGTReport:
    events: list[CGTEvent] = field(default_factory=list)

    @property
    def total_gross_gain(self) -> Decimal:
        return sum(e.gross_gain for e in self.events if e.gross_gain > 0)

    @property
    def total_taxable_gain(self) -> Decimal:
        return sum(e.taxable_gain for e in self.events if e.taxable_gain > 0)

    @property
    def total_losses(self) -> Decimal:
        return sum(e.gross_gain for e in self.events if e.gross_gain < 0)

    def events_for_tax_year(self, tax_year: str) -> list[CGTEvent]:
        return [e for e in self.events if e.tax_year == tax_year]


class AustralianTaxEngine:

    @staticmethod
    def _tax_year(dt: datetime) -> str:
        if dt.month >= 7:
            return f"{dt.year}-{str(dt.year + 1)[2:]}"
        return f"{dt.year - 1}-{str(dt.year)[2:]}"

    @staticmethod
    def calculate_dividend_gross_up(
        net_dividend: Decimal,
        franking_percentage: Decimal,
    ) -> dict:
        """
        Grosses up a franked dividend using the 30% corporate tax rate.
        Formula: franking_credit = net_dividend Ã— (franking_pct / 100) Ã— (30 / 70)
        Gross dividend = net_dividend + franking_credit
        """
        if not franking_percentage or franking_percentage <= 0:
            return {
                "net_dividend": net_dividend,
                "franking_credit": Decimal("0.00"),
                "gross_dividend": net_dividend,
            }

        franking_credit = (
            net_dividend
            * (franking_percentage / Decimal("100"))
            * (Decimal("30") / Decimal("70"))
        )
        gross_dividend = net_dividend + franking_credit

        return {
            "net_dividend": net_dividend,
            "franking_credit": round(franking_credit, 2),
            "gross_dividend": round(gross_dividend, 2),
        }

    @staticmethod
    def process_cgt_event(
        buy_date: datetime,
        sell_date: datetime,
        cost_base: Decimal,
        sale_proceeds: Decimal,
        units_disposed: Decimal,
        asset_ticker: str = "",
    ) -> dict:
        """
        Applies s115-100 ITAA97 50% CGT discount rule.
        Discount qualifies ONLY when holding period is STRICTLY > 365 days.
        Cost base includes brokerage (capitalised per ATO rules).
        Proceeds = gross sale amount minus brokerage.
        """
        gross_gain = sale_proceeds - cost_base
        holding_days = (sell_date.date() - buy_date.date()).days

        if gross_gain <= 0:
            return {
                "gross_gain": round(gross_gain, 2),
                "taxable_gain": round(gross_gain, 2),
                "discount_applied": False,
                "holding_days": holding_days,
            }

        discount_applied = holding_days > 365
        taxable_gain = gross_gain * Decimal("0.50") if discount_applied else gross_gain

        return {
            "gross_gain": round(gross_gain, 2),
            "taxable_gain": round(taxable_gain, 2),
            "discount_applied": discount_applied,
            "holding_days": holding_days,
        }

    @staticmethod
    def calculate_fifo_cgt_report(
        db: Session,
        user_id: int,
        tax_year: Optional[str] = None,
        exclude_super: bool = True,
    ) -> CGTReport:
        """
        Runs a full FIFO CGT report for a user.
        - Processes all assets with SELL transactions
        - Applies FIFO lot matching
        - Applies 50% discount where holding_days > 365
        - Super account transactions excluded by default (not subject to individual CGT)
        """
        from app.models import Account

        report = CGTReport()

        # Get all assets that have been sold
        sell_txns = db.exec(
            select(Transaction)
            .join(Account, Transaction.account_id == Account.id)
            .join(Asset, Transaction.asset_id == Asset.id)
            .where(
                Account.user_id == user_id,
                Transaction.type == TransactionType.SELL,
                Account.is_retirement == (not exclude_super),
            )
            .order_by(Transaction.date)
        ).all()

        if not sell_txns:
            return report

        # Collect unique asset IDs
        asset_ids = list({t.asset_id for t in sell_txns if t.asset_id})

        for asset_id in asset_ids:
            asset = db.get(Asset, asset_id)
            if not asset:
                continue

            # Build FIFO queue from BUY transactions for this asset
            buy_txns = db.exec(
                select(Transaction)
                .join(Account, Transaction.account_id == Account.id)
                .where(
                    Account.user_id == user_id,
                    Transaction.asset_id == asset_id,
                    Transaction.type == TransactionType.BUY,
                )
                .order_by(Transaction.date)
            ).all()

            fifo_queue: list[FIFOLot] = []
            for b in buy_txns:
                if b.units and b.units > 0:
                    cost_base_total = b.amount + b.fees
                    fifo_queue.append(FIFOLot(
                        date=b.date,
                        units=b.units,
                        cost_base_per_unit=cost_base_total / b.units,
                    ))

            # Process each SELL against FIFO queue
            asset_sells = [t for t in sell_txns if t.asset_id == asset_id]

            for sell in asset_sells:
                if not sell.units or sell.units <= 0:
                    continue

                remaining_to_sell = abs(sell.units)
                gross_proceeds_total = sell.amount - sell.fees

                while remaining_to_sell > 0 and fifo_queue:
                    lot = fifo_queue[0]

                    disposed = min(remaining_to_sell, lot.units)
                    lot_cost_base = disposed * lot.cost_base_per_unit
                    lot_proceeds = (disposed / abs(sell.units)) * gross_proceeds_total

                    result = AustralianTaxEngine.process_cgt_event(
                        buy_date=lot.date,
                        sell_date=sell.date,
                        cost_base=lot_cost_base,
                        sale_proceeds=lot_proceeds,
                        units_disposed=disposed,
                        asset_ticker=asset.ticker,
                    )

                    event = CGTEvent(
                        asset_ticker=asset.ticker,
                        sell_date=sell.date,
                        buy_date=lot.date,
                        units_disposed=disposed,
                        cost_base=round(lot_cost_base, 2),
                        gross_proceeds=round(lot_proceeds, 2),
                        gross_gain=result["gross_gain"],
                        holding_days=result["holding_days"],
                        discount_applied=result["discount_applied"],
                        taxable_gain=result["taxable_gain"],
                        tax_year=AustralianTaxEngine._tax_year(sell.date),
                    )
                    report.events.append(event)

                    lot.units -= disposed
                    remaining_to_sell -= disposed

                    if lot.units <= 0:
                        fifo_queue.pop(0)

        if tax_year:
            report.events = report.events_for_tax_year(tax_year)

        return report

    @staticmethod
    def estimate_cgt_future_liability(
        unrealised_gain: Decimal,
        marginal_tax_rate: Decimal,
        long_term: bool = True,
    ) -> Decimal:
        """
        Estimates the CGT tax liability on unrealised gains.
        Used as a "future liability" slot in the net worth calculation.
        Mirrors the LiabilitiesDebts tab CGT liability column.
        """
        taxable = unrealised_gain * Decimal("0.50") if long_term else unrealised_gain
        return round(taxable * marginal_tax_rate, 2)

