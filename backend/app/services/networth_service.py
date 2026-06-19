from __future__ import annotations
"""
Net Worth Aggregator & History Engine
Maps to: Net Worth tab + History tab
Aggregates all asset classes into a single net worth figure
and records monthly snapshots.
"""
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from sqlmodel import Session, select

from app.models import Account, AccountType, Asset, MonthlySnapshot, Transaction, TransactionType
from app.services.cash_service import CashEngine
from app.services.equity_service import EquityEngine
from app.services.property_service import PropertyEngine


@dataclass
class NetWorthSnapshot:
    calculated_at: datetime
    # Asset classes
    shares_value: Decimal = Decimal("0")
    etf_value: Decimal = Decimal("0")
    managed_fund_value: Decimal = Decimal("0")
    crypto_value: Decimal = Decimal("0")
    cash_value: Decimal = Decimal("0")
    super_value: Decimal = Decimal("0")
    property_value: Decimal = Decimal("0")
    other_assets_value: Decimal = Decimal("0")
    # Liabilities
    total_liabilities: Decimal = Decimal("0")
    # Derived
    total_assets: Decimal = field(init=False, default=Decimal("0"))
    net_worth: Decimal = field(init=False, default=Decimal("0"))

    def __post_init__(self):
        self.total_assets = (
            self.shares_value + self.etf_value + self.managed_fund_value
            + self.crypto_value + self.cash_value + self.super_value
            + self.property_value + self.other_assets_value
        )
        self.net_worth = self.total_assets - self.total_liabilities


class NetWorthAggregator:

    @staticmethod
    def get_current_snapshot(db: Session, user_id: int) -> NetWorthSnapshot:
        """
        Calculates current net worth by summing all asset classes.
        Mirrors the Net Worth tab aggregation across rows C4:C15.
        """
        from app.models import AssetClass

        # Equity holdings (ETFs, Stocks, Managed Funds) from brokerage accounts
        holdings = EquityEngine.calculate_portfolio_holdings(
            db, user_id, [AccountType.BROKERAGE]
        )
        shares_value = sum(
            h.market_value for h in holdings if h.asset_class.value == "Stock"
        )
        etf_value = sum(
            h.market_value for h in holdings if h.asset_class.value == "ETF"
        )
        managed_fund_value = sum(
            h.market_value for h in holdings if h.asset_class.value == "Managed Fund"
        )

        # Super
        super_holdings = EquityEngine.calculate_portfolio_holdings(
            db, user_id, [AccountType.SUPER]
        )
        super_value = sum(h.market_value for h in super_holdings)

        # Add direct super account balances (non-investment super)
        super_accounts = db.exec(
            select(Account).where(
                Account.user_id == user_id,
                Account.type == AccountType.SUPER,
            )
        ).all()
        for acct in super_accounts:
            deposits = db.exec(
                select(Transaction).where(
                    Transaction.account_id == acct.id,
                    Transaction.type.in_([TransactionType.DEPOSIT, TransactionType.INCOME]),
                )
            ).all()
            if deposits and not any(h.is_retirement for h in super_holdings):
                super_value += sum(t.amount for t in deposits)

        # Crypto
        crypto_holdings = EquityEngine.calculate_portfolio_holdings(
            db, user_id, [AccountType.CRYPTO]
        )
        crypto_value = sum(h.market_value for h in crypto_holdings)

        # Cash
        cash_value = CashEngine.get_total_cash(db, user_id)

        # Property
        property_metrics = PropertyEngine.get_property_metrics(db, user_id)
        property_equity = sum(p.net_equity for p in property_metrics)

        # Other assets (manual valuations)
        other_accounts = db.exec(
            select(Account).where(
                Account.user_id == user_id,
                Account.type == AccountType.OTHER_ASSET,
            )
        ).all()
        other_value = Decimal("0")
        for acct in other_accounts:
            income_txns = db.exec(
                select(Transaction).where(
                    Transaction.account_id == acct.id,
                    Transaction.type == TransactionType.INCOME,
                )
            ).all()
            if income_txns:
                other_value += income_txns[-1].amount  # Latest valuation

        # Liabilities
        liability_accounts = db.exec(
            select(Account).where(
                Account.user_id == user_id,
                Account.type == AccountType.LIABILITY,
            )
        ).all()
        total_liabilities = Decimal("0")
        for acct in liability_accounts:
            borrowed = db.exec(
                select(Transaction).where(
                    Transaction.account_id == acct.id,
                    Transaction.type == TransactionType.DEPOSIT,
                )
            ).all()
            repaid = db.exec(
                select(Transaction).where(
                    Transaction.account_id == acct.id,
                    Transaction.type.in_([TransactionType.WITHDRAWAL, TransactionType.EXPENSE]),
                )
            ).all()
            balance = sum(t.amount for t in borrowed) - sum(t.amount for t in repaid)
            total_liabilities += max(balance, Decimal("0"))

        return NetWorthSnapshot(
            calculated_at=datetime.utcnow(),
            shares_value=round(shares_value, 2),
            etf_value=round(etf_value, 2),
            managed_fund_value=round(managed_fund_value, 2),
            crypto_value=round(crypto_value, 2),
            cash_value=round(cash_value, 2),
            super_value=round(super_value, 2),
            property_value=round(property_equity, 2),
            other_assets_value=round(other_value, 2),
            total_liabilities=round(total_liabilities, 2),
        )

    @staticmethod
    def record_monthly_snapshot(db: Session, user_id: int) -> MonthlySnapshot:
        """
        Writes a MonthlySnapshot row â€” the database equivalent of the History tab.
        Should be called once per month (e.g. via a scheduled job on EOMONTH).
        """
        snapshot = NetWorthAggregator.get_current_snapshot(db, user_id)

        from calendar import monthrange
        now = datetime.utcnow()
        last_day = monthrange(now.year, now.month)[1]
        eomonth = datetime(now.year, now.month, last_day)

        row = MonthlySnapshot(
            user_id=user_id,
            snapshot_date=eomonth,
            shares_value=snapshot.shares_value,
            etf_value=snapshot.etf_value,
            managed_fund_value=snapshot.managed_fund_value,
            crypto_value=snapshot.crypto_value,
            cash_value=snapshot.cash_value,
            super_value=snapshot.super_value,
            property_current_value=snapshot.property_value,
            other_assets_value=snapshot.other_assets_value,
            liabilities_balance=snapshot.total_liabilities,
            total_assets=snapshot.total_assets,
            total_liabilities=snapshot.total_liabilities,
            net_worth=snapshot.net_worth,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row

    @staticmethod
    def get_history(
        db: Session,
        user_id: int,
        limit: int = 24,
    ) -> list[MonthlySnapshot]:
        """Returns the most recent monthly snapshots for time-series charts."""
        return db.exec(
            select(MonthlySnapshot)
            .where(MonthlySnapshot.user_id == user_id)
            .order_by(MonthlySnapshot.snapshot_date.desc())
            .limit(limit)
        ).all()

