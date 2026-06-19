"""
Seed script for local development and testing.
Run: python seed_data.py
"""
from datetime import datetime, timedelta
from decimal import Decimal

from passlib.context import CryptContext
from sqlmodel import Session

from app.db import create_db_and_tables, engine
from app.models import (
    Account,
    AccountType,
    Asset,
    AssetClass,
    Transaction,
    TransactionType,
    User,
    UserSettings,
    PayFrequency,
    CGTMethod,
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed() -> None:
    create_db_and_tables()

    with Session(engine) as db:
        # User
        user = User(
            email="demo@wealth.local",
            display_name="Demo User",
            hashed_password=pwd_context.hash("demo1234"),
        )
        db.add(user)
        db.flush()

        # Settings
        settings = UserSettings(
            user_id=user.id,
            base_currency="AUD",
            pay_frequency=PayFrequency.FORTNIGHTLY,
            pay_day_of_month=10,
            employment_salary=Decimal("95000.00"),
            default_brokerage_fee=Decimal("9.95"),
            cgt_method=CGTMethod.FIFO,
            marginal_tax_rate=Decimal("0.325"),
            use_budget=True,
            emergency_fund_months=3,
            fire_safe_withdrawal_rate=Decimal("0.04"),
            fire_investment_return_rate=Decimal("0.07"),
            fire_inflation_rate=Decimal("0.03"),
            fire_target_annual_spend=Decimal("60000.00"),
            fire_current_age=32,
            fire_target_retire_age=50,
            fire_life_expectancy=90,
            bank_interest_rate=Decimal("0.05"),
        )
        db.add(settings)

        # Accounts
        acct_commsec = Account(
            user_id=user.id, name="CommSec Brokerage",
            type=AccountType.BROKERAGE, institution="CommSec",
        )
        acct_offset = Account(
            user_id=user.id, name="CBA Offset Account",
            type=AccountType.CASH, institution="Commonwealth Bank",
        )
        acct_savings = Account(
            user_id=user.id, name="ING Savings",
            type=AccountType.CASH, institution="ING",
        )
        acct_super = Account(
            user_id=user.id, name="Hostplus Super",
            type=AccountType.SUPER, institution="Hostplus",
            is_retirement=True,
        )
        acct_crypto = Account(
            user_id=user.id, name="CoinSpot",
            type=AccountType.CRYPTO, institution="CoinSpot",
        )
        for a in [acct_commsec, acct_offset, acct_savings, acct_super, acct_crypto]:
            db.add(a)
        db.flush()

        # Assets
        vas = Asset(ticker="VAS.AX", name="Vanguard Australian Shares Index ETF",
                    category=AccountType.BROKERAGE, asset_class=AssetClass.ETF,
                    current_price=Decimal("107.50"))
        vgs = Asset(ticker="VGS.AX", name="Vanguard MSCI Index International Shares ETF",
                    category=AccountType.BROKERAGE, asset_class=AssetClass.ETF,
                    current_price=Decimal("135.20"))
        anz = Asset(ticker="ANZ.AX", name="ANZ Group Holdings",
                    category=AccountType.BROKERAGE, asset_class=AssetClass.STOCK,
                    current_price=Decimal("29.85"))
        btc = Asset(ticker="bitcoin", name="Bitcoin",
                    category=AccountType.CRYPTO, asset_class=AssetClass.CRYPTO,
                    current_price=Decimal("95000.00"))
        cash_aud = Asset(ticker="CASH", name="Australian Dollar Cash",
                         category=AccountType.CASH, asset_class=AssetClass.CASH,
                         current_price=Decimal("1.00"))
        for a in [vas, vgs, anz, btc, cash_aud]:
            db.add(a)
        db.flush()

        # Transactions
        today = datetime.utcnow()
        txns = [
            # VAS — two BUY lots (first is >365 days ago → CGT discount eligible)
            Transaction(account_id=acct_commsec.id, asset_id=vas.id, type=TransactionType.BUY,
                        date=today - timedelta(days=500), units=Decimal("50"),
                        price_per_unit=Decimal("90.00"), amount=Decimal("4500.00"),
                        fees=Decimal("9.95")),
            Transaction(account_id=acct_commsec.id, asset_id=vas.id, type=TransactionType.BUY,
                        date=today - timedelta(days=180), units=Decimal("30"),
                        price_per_unit=Decimal("100.00"), amount=Decimal("3000.00"),
                        fees=Decimal("9.95")),

            # VGS — BUY
            Transaction(account_id=acct_commsec.id, asset_id=vgs.id, type=TransactionType.BUY,
                        date=today - timedelta(days=400), units=Decimal("40"),
                        price_per_unit=Decimal("120.00"), amount=Decimal("4800.00"),
                        fees=Decimal("9.95")),

            # ANZ — BUY + SELL (short-term, no CGT discount)
            Transaction(account_id=acct_commsec.id, asset_id=anz.id, type=TransactionType.BUY,
                        date=today - timedelta(days=100), units=Decimal("200"),
                        price_per_unit=Decimal("27.00"), amount=Decimal("5400.00"),
                        fees=Decimal("9.95")),
            Transaction(account_id=acct_commsec.id, asset_id=anz.id, type=TransactionType.SELL,
                        date=today - timedelta(days=20), units=Decimal("100"),
                        price_per_unit=Decimal("29.50"), amount=Decimal("2950.00"),
                        fees=Decimal("9.95")),

            # ANZ Dividend with 100% franking
            Transaction(account_id=acct_commsec.id, asset_id=anz.id, type=TransactionType.DIVIDEND,
                        date=today - timedelta(days=30), units=Decimal("200"),
                        price_per_unit=Decimal("0.73"), amount=Decimal("146.00"),
                        franking_percentage=Decimal("100.00")),

            # VAS Dividend with 100% franking
            Transaction(account_id=acct_commsec.id, asset_id=vas.id, type=TransactionType.DIVIDEND,
                        date=today - timedelta(days=60), units=Decimal("80"),
                        price_per_unit=Decimal("1.24"), amount=Decimal("99.20"),
                        franking_percentage=Decimal("100.00")),

            # Cash deposits
            Transaction(account_id=acct_offset.id, asset_id=cash_aud.id, type=TransactionType.DEPOSIT,
                        date=today - timedelta(days=365), amount=Decimal("50000.00")),
            Transaction(account_id=acct_savings.id, asset_id=cash_aud.id, type=TransactionType.DEPOSIT,
                        date=today - timedelta(days=365), amount=Decimal("15000.00")),

            # Monthly salary income
            Transaction(account_id=acct_offset.id, type=TransactionType.INCOME,
                        date=today - timedelta(days=10), amount=Decimal("6250.00"),
                        notes="Monthly salary"),

            # Monthly expense
            Transaction(account_id=acct_offset.id, type=TransactionType.EXPENSE,
                        date=today - timedelta(days=5), amount=Decimal("3200.00"),
                        notes="Monthly living expenses"),

            # Super contribution
            Transaction(account_id=acct_super.id, type=TransactionType.DEPOSIT,
                        date=today - timedelta(days=30), amount=Decimal("1500.00"),
                        notes="Voluntary super contribution"),

            # Bitcoin
            Transaction(account_id=acct_crypto.id, asset_id=btc.id, type=TransactionType.BUY,
                        date=today - timedelta(days=800), units=Decimal("0.05"),
                        price_per_unit=Decimal("40000.00"), amount=Decimal("2000.00"),
                        fees=Decimal("20.00")),
        ]
        for t in txns:
            db.add(t)

        db.commit()
        print("Seed data inserted successfully.")
        print(f"  Demo login: demo@wealth.local / demo1234")


if __name__ == "__main__":
    seed()
