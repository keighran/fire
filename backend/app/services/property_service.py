from __future__ import annotations
"""
Module 5 â€” Property & Fixed Assets Ledger
Maps to: Property, Other Assets tabs
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from app.models import Account, AccountType, Transaction, TransactionType


@dataclass
class PropertyMetrics:
    account_name: str
    purchase_price: Decimal
    current_valuation: Decimal
    mortgage_balance: Decimal
    total_interest_fees_paid: Decimal
    total_principal_paid: Decimal
    net_equity: Decimal
    total_growth: Decimal
    total_growth_pct: Decimal
    lvr: Decimal


class PropertyEngine:

    @staticmethod
    def calculate_property_equity(
        purchase_price: Decimal,
        current_valuation: Decimal,
        remaining_loan: Decimal,
    ) -> dict:
        """
        Mirrors Property tab equity formulas.
        LVR = mortgage_balance / current_valuation Ã— 100
        """
        total_growth = current_valuation - purchase_price
        net_equity = current_valuation - remaining_loan
        lvr = (remaining_loan / current_valuation * 100) if current_valuation > 0 else Decimal("0")
        growth_pct = (total_growth / purchase_price * 100) if purchase_price > 0 else Decimal("0")

        return {
            "net_equity": round(net_equity, 2),
            "total_growth": round(total_growth, 2),
            "total_growth_pct": round(growth_pct, 2),
            "lvr": round(lvr, 2),
        }

    @staticmethod
    def get_property_metrics(db: Session, user_id: int) -> list[PropertyMetrics]:
        """
        Calculates property equity, LVR, and mortgage progress per property account.
        """
        accounts = db.exec(
            select(Account).where(
                Account.user_id == user_id,
                Account.type == AccountType.PROPERTY,
            )
        ).all()

        results = []
        for account in accounts:
            txns = db.exec(
                select(Transaction).where(Transaction.account_id == account.id)
                .order_by(Transaction.date)
            ).all()

            if not txns:
                continue

            # Purchase price = first DEPOSIT (property acquisition)
            purchase_txn = next((t for t in txns if t.type == TransactionType.DEPOSIT), None)
            purchase_price = purchase_txn.amount if purchase_txn else Decimal("0")

            # Current valuation = most recent INCOME transaction (manual revaluation entry)
            valuation_txns = [t for t in txns if t.type == TransactionType.INCOME]
            current_valuation = valuation_txns[-1].amount if valuation_txns else purchase_price

            # Mortgage: EXPENSE = interest+fees; WITHDRAWAL = principal repayment
            interest_fees = sum(
                t.amount for t in txns if t.type == TransactionType.EXPENSE
            )
            principal_paid = sum(
                t.amount for t in txns if t.type == TransactionType.WITHDRAWAL
            )
            total_borrowed = purchase_price  # Simplified; extend for refinancing
            mortgage_balance = total_borrowed - principal_paid

            metrics = PropertyEngine.calculate_property_equity(
                purchase_price, current_valuation, mortgage_balance
            )

            results.append(PropertyMetrics(
                account_name=account.name,
                purchase_price=round(purchase_price, 2),
                current_valuation=round(current_valuation, 2),
                mortgage_balance=round(mortgage_balance, 2),
                total_interest_fees_paid=round(interest_fees, 2),
                total_principal_paid=round(principal_paid, 2),
                net_equity=metrics["net_equity"],
                total_growth=metrics["total_growth"],
                total_growth_pct=metrics["total_growth_pct"],
                lvr=metrics["lvr"],
            ))

        return results

