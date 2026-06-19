from __future__ import annotations
"""
Module 2 â€” Cash & Budget Engine
Maps to: Cash, Budget, Side Income, LiabilitiesDebts tabs
"""
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlmodel import Session, select

from app.models import Account, AccountType, Transaction, TransactionType, UserSettings, PayFrequency


# ---------------------------------------------------------------------------
# Pay frequency normaliser (mirrors Budget tab formula)
# ---------------------------------------------------------------------------

PAY_FREQ_TO_MONTHLY: dict[PayFrequency, Decimal] = {
    PayFrequency.WEEKLY: Decimal("4.34523783659"),
    PayFrequency.FORTNIGHTLY: Decimal("4.34523783659") / 2,
    PayFrequency.TWICE_MONTHLY: Decimal("2"),
    PayFrequency.FOUR_WEEKLY: Decimal("1.0833333333"),
    PayFrequency.MONTHLY: Decimal("1"),
}


@dataclass
class BudgetSummary:
    year: int
    month: int
    total_income: Decimal
    total_expenses: Decimal
    net_savings: Decimal
    savings_rate_pct: Decimal


@dataclass
class LiabilityBalance:
    account_name: str
    remaining_balance: Decimal
    total_paid: Decimal
    progress_pct: Decimal


class CashEngine:

    @staticmethod
    def get_cash_balances(db: Session, user_id: int) -> dict[str, Decimal]:
        """
        Calculates running balance per CASH account via transaction sum.
        Deposits and INCOME add; Withdrawals and EXPENSE subtract.
        """
        accounts = db.exec(
            select(Account).where(
                Account.user_id == user_id,
                Account.type == AccountType.CASH,
            )
        ).all()

        balances: dict[str, Decimal] = {}
        for account in accounts:
            result = db.exec(
                select(func.sum(Transaction.amount)).where(
                    Transaction.account_id == account.id,
                    Transaction.type.in_([
                        TransactionType.DEPOSIT,
                        TransactionType.INCOME,
                        TransactionType.INTEREST,
                    ]),
                )
            ).one()
            inflows = result or Decimal("0")

            result = db.exec(
                select(func.sum(Transaction.amount)).where(
                    Transaction.account_id == account.id,
                    Transaction.type.in_([
                        TransactionType.WITHDRAWAL,
                        TransactionType.EXPENSE,
                    ]),
                )
            ).one()
            outflows = result or Decimal("0")

            balances[account.name] = inflows - outflows

        return balances

    @staticmethod
    def get_total_cash(db: Session, user_id: int) -> Decimal:
        balances = CashEngine.get_cash_balances(db, user_id)
        return sum(balances.values(), Decimal("0"))


class BudgetEngine:

    @staticmethod
    def normalise_to_monthly(amount: Decimal, frequency: PayFrequency) -> Decimal:
        """
        Converts a per-period amount to monthly equivalent.
        Mirrors the Budget tab pay frequency formula.
        """
        multiplier = PAY_FREQ_TO_MONTHLY.get(frequency, Decimal("1"))
        return amount * multiplier

    @staticmethod
    def emergency_fund_target(monthly_expenses: Decimal, months: int) -> Decimal:
        """
        Calculates target emergency fund, rounded up to the nearest $1,000.
        Mirrors: ROUNDUP(months Ã— monthly_expenses / 1000, 0) Ã— 1000
        """
        import math
        raw = monthly_expenses * months
        return Decimal(str(math.ceil(float(raw) / 1000) * 1000))

    @staticmethod
    def calculate_monthly_budget_summary(
        db: Session, user_id: int, year: int, month: int
    ) -> BudgetSummary:
        """
        Aggregates income, side income, and expenses for a given calendar month.
        """
        from sqlalchemy import extract

        def _sum_types(types: list[TransactionType]) -> Decimal:
            result = db.exec(
                select(func.sum(Transaction.amount))
                .join(Account, Transaction.account_id == Account.id)
                .where(
                    Account.user_id == user_id,
                    Transaction.type.in_(types),
                    extract("year", Transaction.date) == year,
                    extract("month", Transaction.date) == month,
                )
            ).one()
            return result or Decimal("0")

        income = _sum_types([TransactionType.INCOME, TransactionType.DEPOSIT, TransactionType.INTEREST])
        expenses = _sum_types([TransactionType.EXPENSE, TransactionType.WITHDRAWAL])
        net = income - expenses
        savings_rate = (net / income * 100) if income > 0 else Decimal("0")

        return BudgetSummary(
            year=year, month=month,
            total_income=round(income, 2),
            total_expenses=round(expenses, 2),
            net_savings=round(net, 2),
            savings_rate_pct=round(savings_rate, 2),
        )

    @staticmethod
    def calculate_annual_savings_rate(
        db: Session,
        user_id: int,
        dividend_income: Decimal = Decimal("0"),
        side_income: Decimal = Decimal("0"),
    ) -> Decimal:
        """
        Annual savings rate = net_savings / (salary + side_income + non-reinvested dividends)
        Mirrors the Cash tab savings rate column.
        """
        settings = db.exec(
            select(UserSettings).where(UserSettings.user_id == user_id)
        ).first()

        annual_salary = settings.employment_salary if settings else Decimal("0")
        gross_income = annual_salary + side_income + dividend_income

        now = datetime.utcnow()
        year_ago = datetime(now.year - 1, now.month, now.day)

        total_expenses = db.exec(
            select(func.sum(Transaction.amount))
            .join(Account, Transaction.account_id == Account.id)
            .where(
                Account.user_id == user_id,
                Transaction.type.in_([TransactionType.EXPENSE, TransactionType.WITHDRAWAL]),
                Transaction.date >= year_ago,
            )
        ).one() or Decimal("0")

        net_savings = gross_income - total_expenses
        return round(net_savings / gross_income * 100, 2) if gross_income > 0 else Decimal("0")


class SideIncomeEngine:

    @staticmethod
    def get_monthly_side_income(db: Session, user_id: int) -> list[dict]:
        """Returns monthly side income totals (INCOME transactions in non-brokerage accounts)."""
        txns = db.exec(
            select(Transaction)
            .join(Account, Transaction.account_id == Account.id)
            .where(
                Account.user_id == user_id,
                Transaction.type == TransactionType.INCOME,
                Account.type.in_([AccountType.CASH, AccountType.OTHER_ASSET]),
            )
            .order_by(Transaction.date)
        ).all()

        monthly: dict[str, Decimal] = {}
        for t in txns:
            key = t.date.strftime("%Y-%m")
            monthly[key] = monthly.get(key, Decimal("0")) + t.amount

        return [{"month": k, "amount": v} for k, v in sorted(monthly.items())]

    @staticmethod
    def get_rolling_365_average(db: Session, user_id: int) -> Decimal:
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(days=365)

        result = db.exec(
            select(func.avg(Transaction.amount))
            .join(Account, Transaction.account_id == Account.id)
            .where(
                Account.user_id == user_id,
                Transaction.type == TransactionType.INCOME,
                Account.type == AccountType.CASH,
                Transaction.date >= cutoff,
            )
        ).one()

        return round(result or Decimal("0"), 2)


class LiabilityEngine:

    @staticmethod
    def get_liability_balances(db: Session, user_id: int) -> list[LiabilityBalance]:
        """
        Remaining balance per LIABILITY account.
        Mirrors the LiabilitiesDebts tab balance tracking.
        """
        accounts = db.exec(
            select(Account).where(
                Account.user_id == user_id,
                Account.type == AccountType.LIABILITY,
            )
        ).all()

        balances = []
        for account in accounts:
            # Deposits (loan drawdowns) add to balance; withdrawals (repayments) reduce it
            borrowed = db.exec(
                select(func.sum(Transaction.amount)).where(
                    Transaction.account_id == account.id,
                    Transaction.type == TransactionType.DEPOSIT,
                )
            ).one() or Decimal("0")

            repaid = db.exec(
                select(func.sum(Transaction.amount)).where(
                    Transaction.account_id == account.id,
                    Transaction.type.in_([TransactionType.WITHDRAWAL, TransactionType.EXPENSE]),
                )
            ).one() or Decimal("0")

            remaining = borrowed - repaid
            progress = (repaid / borrowed * 100) if borrowed > 0 else Decimal("0")

            balances.append(LiabilityBalance(
                account_name=account.name,
                remaining_balance=round(remaining, 2),
                total_paid=round(repaid, 2),
                progress_pct=round(progress, 2),
            ))

        return balances

