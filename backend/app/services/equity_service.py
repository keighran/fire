from __future__ import annotations
"""
Module 3 â€” Equities & Market Integration
Handles portfolio holdings calculation, weighted average cost, annualised returns,
dividend yield-on-cost, and FY dividend summaries.
"""
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from app.models import Account, AccountType, Asset, AssetClass, Transaction, TransactionType


@dataclass
class Holding:
    ticker: str
    name: str
    asset_class: AssetClass
    total_units: Decimal
    cost_base: Decimal
    weighted_avg_cost: Decimal
    current_price: Decimal
    market_value: Decimal
    unrealised_gain: Decimal
    unrealised_gain_pct: Decimal
    annualised_return_pct: Decimal
    first_purchase_date: Optional[datetime]
    total_dividends_received: Decimal
    dividend_yield_on_cost: Decimal
    is_retirement: bool = False


@dataclass
class DividendSummary:
    ticker: str
    asset_class: str
    date: datetime
    net_amount: Decimal
    franking_percentage: Decimal
    franking_credit: Decimal
    gross_amount: Decimal
    units_at_ex_date: Decimal
    yield_on_cost: Decimal
    tax_year: str


class EquityEngine:

    @staticmethod
    def calculate_portfolio_holdings(
        db: Session,
        user_id: int,
        asset_categories: Optional[list[AccountType]] = None,
    ) -> list[Holding]:
        """
        Calculates current holdings for a user.
        Net units = SUM(BUY units) - SUM(SELL units)
        Cost base = SUM(BUY amount + BUY fees) - proportional cost of sold units (FIFO simplified to avg)
        """
        if asset_categories is None:
            asset_categories = [AccountType.BROKERAGE, AccountType.SUPER]

        assets = db.exec(
            select(Asset).where(Asset.category.in_(asset_categories))
        ).all()

        holdings = []
        for asset in assets:
            # Get all transactions for this asset under this user
            txns = db.exec(
                select(Transaction)
                .join(Account, Transaction.account_id == Account.id)
                .where(
                    Account.user_id == user_id,
                    Transaction.asset_id == asset.id,
                    Transaction.type.in_([TransactionType.BUY, TransactionType.SELL]),
                )
                .order_by(Transaction.date)
            ).all()

            if not txns:
                continue

            buy_units = sum(t.units for t in txns if t.type == TransactionType.BUY and t.units)
            sell_units = sum(abs(t.units) for t in txns if t.type == TransactionType.SELL and t.units)
            net_units = buy_units - sell_units

            if net_units <= 0:
                continue

            total_cost_base = sum(
                t.amount + t.fees for t in txns if t.type == TransactionType.BUY
            )
            # Proportionally reduce cost base for sold units
            if buy_units > 0 and sell_units > 0:
                sold_fraction = sell_units / buy_units
                total_cost_base = total_cost_base * (1 - sold_fraction)

            wav_cost = total_cost_base / net_units if net_units > 0 else Decimal("0")
            market_value = net_units * asset.current_price
            unrealised_gain = market_value - total_cost_base
            unrealised_gain_pct = (
                (unrealised_gain / total_cost_base * 100) if total_cost_base > 0 else Decimal("0")
            )

            buy_txns = [t for t in txns if t.type == TransactionType.BUY]
            first_purchase = min(t.date for t in buy_txns) if buy_txns else None
            holding_days = (datetime.utcnow() - first_purchase).days if first_purchase else 1

            annualised_return_pct = (
                (unrealised_gain / total_cost_base) / holding_days * 365 * 100
                if total_cost_base > 0 and holding_days > 0
                else Decimal("0")
            )

            # Dividends for yield-on-cost
            div_txns = db.exec(
                select(Transaction)
                .join(Account, Transaction.account_id == Account.id)
                .where(
                    Account.user_id == user_id,
                    Transaction.asset_id == asset.id,
                    Transaction.type == TransactionType.DIVIDEND,
                )
            ).all()
            total_dividends = sum(t.amount for t in div_txns) if div_txns else Decimal("0")
            yield_on_cost = (
                total_dividends / total_cost_base * 100 if total_cost_base > 0 else Decimal("0")
            )

            # Check if account is retirement
            first_txn_account = db.get(Account, txns[0].account_id)
            is_retirement = first_txn_account.is_retirement if first_txn_account else False

            holdings.append(Holding(
                ticker=asset.ticker,
                name=asset.name,
                asset_class=asset.asset_class,
                total_units=net_units,
                cost_base=round(total_cost_base, 2),
                weighted_avg_cost=round(wav_cost, 4),
                current_price=asset.current_price,
                market_value=round(market_value, 2),
                unrealised_gain=round(unrealised_gain, 2),
                unrealised_gain_pct=round(unrealised_gain_pct, 2),
                annualised_return_pct=round(annualised_return_pct, 2),
                first_purchase_date=first_purchase,
                total_dividends_received=round(total_dividends, 2),
                dividend_yield_on_cost=round(yield_on_cost, 2),
                is_retirement=is_retirement,
            ))

        return holdings

    @staticmethod
    def get_dividend_history(db: Session, user_id: int) -> list[DividendSummary]:
        """
        Returns full dividend ledger with franking gross-up and yield-on-cost.
        Yield-on-cost = net_amount / (price_at_ex_date Ã— units_at_ex_date)
        """
        from app.services.tax_service import AustralianTaxEngine

        div_txns = db.exec(
            select(Transaction)
            .join(Account, Transaction.account_id == Account.id)
            .join(Asset, Transaction.asset_id == Asset.id)
            .where(
                Account.user_id == user_id,
                Transaction.type == TransactionType.DIVIDEND,
            )
            .order_by(Transaction.date.desc())
        ).all()

        summaries = []
        for t in div_txns:
            asset = db.get(Asset, t.asset_id)
            if not asset:
                continue

            franking_pct = t.franking_percentage or Decimal("0")
            grossed = AustralianTaxEngine.calculate_dividend_gross_up(t.amount, franking_pct)

            units_at_ex = t.units or Decimal("0")
            price_at_ex = t.price_per_unit or Decimal("0")
            cost_at_ex = units_at_ex * price_at_ex
            yield_on_cost = (
                t.amount / cost_at_ex * 100 if cost_at_ex > 0 else Decimal("0")
            )

            tax_year = (
                f"{t.date.year}-{str(t.date.year + 1)[2:]}"
                if t.date.month >= 7
                else f"{t.date.year - 1}-{str(t.date.year)[2:]}"
            )

            summaries.append(DividendSummary(
                ticker=asset.ticker,
                asset_class=asset.asset_class.value,
                date=t.date,
                net_amount=t.amount,
                franking_percentage=franking_pct,
                franking_credit=grossed["franking_credit"],
                gross_amount=grossed["gross_dividend"],
                units_at_ex_date=units_at_ex,
                yield_on_cost=round(yield_on_cost, 4),
                tax_year=tax_year,
            ))

        return summaries

    @staticmethod
    def get_dividend_fy_summary(db: Session, user_id: int) -> dict:
        """
        FY Julâ€“Jun aggregation by asset class.
        Mirrors the Dividends tab FY summary columns.
        """
        all_divs = EquityEngine.get_dividend_history(db, user_id)

        fy_map: dict[str, dict] = {}
        for d in all_divs:
            fy = d.tax_year
            if fy not in fy_map:
                fy_map[fy] = {"ETF": Decimal("0"), "Stock": Decimal("0"),
                               "Managed Fund": Decimal("0"), "Crypto": Decimal("0"), "total": Decimal("0")}
            ac = d.asset_class
            if ac in fy_map[fy]:
                fy_map[fy][ac] += d.net_amount
            fy_map[fy]["total"] += d.net_amount

        return dict(sorted(fy_map.items()))

