"""
Smoke test — runs the full API stack against an in-memory SQLite database.
No Docker required. Verifies every major endpoint returns a 200 and sensible data.
"""
from __future__ import annotations

import pytest
from decimal import Decimal
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.main import app
from app.db import get_session
from app.models import (
    Account, AccountType, Asset, AssetClass,
    Transaction, TransactionType, User, UserSettings,
    PayFrequency, CGTMethod,
)


# ---------------------------------------------------------------------------
# In-memory SQLite test database
# ---------------------------------------------------------------------------

@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Seed helper
# ---------------------------------------------------------------------------

def seed_db(session: Session):
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

    user = User(email="smoke@test.local", display_name="Smoke", hashed_password=pwd.hash("test"))
    session.add(user)
    session.flush()

    settings = UserSettings(
        user_id=user.id,
        employment_salary=Decimal("100000"),
        fire_target_annual_spend=Decimal("60000"),
        fire_current_age=35,
        fire_target_retire_age=55,
    )
    session.add(settings)

    acct = Account(user_id=user.id, name="CommSec", type=AccountType.BROKERAGE, institution="CommSec")
    cash_acct = Account(user_id=user.id, name="CBA", type=AccountType.CASH, institution="CBA")
    session.add(acct)
    session.add(cash_acct)
    session.flush()

    vas = Asset(ticker="VAS.AX", name="Vanguard AU Shares ETF",
                category=AccountType.BROKERAGE, asset_class=AssetClass.ETF,
                current_price=Decimal("107.50"))
    cash_asset = Asset(ticker="CASH", name="Cash",
                       category=AccountType.CASH, asset_class=AssetClass.CASH,
                       current_price=Decimal("1.00"))
    session.add(vas)
    session.add(cash_asset)
    session.flush()

    today = datetime.utcnow()
    txns = [
        Transaction(account_id=acct.id, asset_id=vas.id, type=TransactionType.BUY,
                    date=today - timedelta(days=500), units=Decimal("50"),
                    price_per_unit=Decimal("90"), amount=Decimal("4500"), fees=Decimal("9.95")),
        Transaction(account_id=acct.id, asset_id=vas.id, type=TransactionType.SELL,
                    date=today - timedelta(days=10), units=Decimal("10"),
                    price_per_unit=Decimal("107"), amount=Decimal("1070"), fees=Decimal("9.95")),
        Transaction(account_id=acct.id, asset_id=vas.id, type=TransactionType.DIVIDEND,
                    date=today - timedelta(days=30), units=Decimal("50"),
                    price_per_unit=Decimal("1.20"), amount=Decimal("60"),
                    franking_percentage=Decimal("100")),
        Transaction(account_id=cash_acct.id, asset_id=cash_asset.id, type=TransactionType.DEPOSIT,
                    date=today - timedelta(days=365), amount=Decimal("30000")),
        Transaction(account_id=cash_acct.id, type=TransactionType.INCOME,
                    date=today - timedelta(days=10), amount=Decimal("5000")),
        Transaction(account_id=cash_acct.id, type=TransactionType.EXPENSE,
                    date=today - timedelta(days=5), amount=Decimal("2500")),
    ]
    for t in txns:
        session.add(t)
    session.commit()
    return user.id


# ---------------------------------------------------------------------------
# Smoke tests
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    def test_health(self, client: TestClient):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestAccountEndpoints:
    def test_create_and_list_accounts(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/accounts")
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_create_account(self, client: TestClient):
        r = client.post("/api/accounts", json={
            "name": "Test Brokerage", "type": "Brokerage",
            "institution": "Test Bank", "currency": "AUD",
        })
        assert r.status_code == 200
        assert r.json()["name"] == "Test Brokerage"


class TestTransactionEndpoints:
    def test_create_asset_and_transaction(self, client: TestClient):
        # Create asset first
        r = client.post("/api/assets", json={
            "ticker": "VGS.AX", "name": "Vanguard International ETF",
            "category": "Brokerage", "asset_class": "ETF",
        })
        assert r.status_code == 200
        asset_id = r.json()["id"]

        # Create account
        r2 = client.post("/api/accounts", json={
            "name": "CommSec2", "type": "Brokerage", "institution": "CommSec",
        })
        account_id = r2.json()["id"]

        # Create transaction
        r3 = client.post("/api/transactions", json={
            "account_id": account_id,
            "asset_id": asset_id,
            "type": "Buy",
            "date": datetime.utcnow().isoformat(),
            "units": "20",
            "price_per_unit": "130.00",
            "amount": "2600.00",
            "fees": "9.95",
        })
        assert r3.status_code == 200
        assert r3.json()["amount"] == "2600.00"

    def test_list_transactions(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/transactions")
        assert r.status_code == 200
        assert len(r.json()) >= 3


class TestNetWorthEndpoint:
    def test_net_worth_returns_snapshot(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/net-worth")
        assert r.status_code == 200
        data = r.json()
        assert "net_worth" in data
        assert "total_assets" in data
        assert "cash_value" in data
        # Cash should be $30000 deposit + $5000 income - $2500 expenses = $32500
        assert data["cash_value"] == pytest.approx(32500.0, rel=0.01)

    def test_net_worth_etf_value(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/net-worth")
        data = r.json()
        # 40 remaining VAS units (50 bought - 10 sold) × $107.50 = $4300
        assert data["etf_value"] == pytest.approx(4300.0, rel=0.01)


class TestHoldingsEndpoint:
    def test_holdings_returns_list(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/holdings")
        assert r.status_code == 200
        holdings = r.json()
        assert len(holdings) >= 1
        vas = next((h for h in holdings if h["ticker"] == "VAS.AX"), None)
        assert vas is not None
        assert vas["total_units"] == pytest.approx(40.0)
        assert vas["current_price"] == pytest.approx(107.5)
        assert vas["market_value"] == pytest.approx(4300.0)

    def test_holdings_unrealised_gain(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/holdings")
        vas = next(h for h in r.json() if h["ticker"] == "VAS.AX")
        # cost base after proportional reduction for sold units:
        # total buy: 50 × $90 + $9.95 = $4509.95; sold 10/50 = 20%
        # remaining cost = $4509.95 × 0.8 = $3607.96; market = 40 × $107.50 = $4300
        assert vas["unrealised_gain"] > 0


class TestDividendEndpoints:
    def test_dividends_list(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/dividends")
        assert r.status_code == 200
        divs = r.json()
        assert len(divs) >= 1
        vas_div = divs[0]
        assert vas_div["net_amount"] == pytest.approx(60.0)
        assert vas_div["franking_percentage"] == pytest.approx(100.0)
        # 100% franked $60: franking_credit = 60 × (30/70) = $25.71
        assert vas_div["franking_credit"] == pytest.approx(25.71, abs=0.01)
        assert vas_div["gross_amount"] == pytest.approx(85.71, abs=0.01)

    def test_dividend_fy_summary(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/dividends/fy-summary")
        assert r.status_code == 200
        assert len(r.json()) >= 1


class TestCGTEndpoint:
    def test_cgt_report_has_disposal(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/cgt-report")
        assert r.status_code == 200
        data = r.json()
        assert len(data["events"]) >= 1
        event = data["events"][0]
        # BUY was 500 days ago, SELL was 10 days ago → 490 days held → discount applies
        assert event["discount_applied"] is True
        assert event["holding_days"] == pytest.approx(490, abs=2)

    def test_cgt_discount_halves_taxable_gain(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/cgt-report")
        event = r.json()["events"][0]
        assert event["taxable_gain"] == pytest.approx(event["gross_gain"] * 0.5, rel=0.01)

    def test_dividend_gross_up_calculation(self, client: TestClient):
        r = client.get("/api/tax/dividend-gross-up?net_amount=70&franking_pct=100")
        assert r.status_code == 200
        data = r.json()
        assert data["franking_credit"] == pytest.approx(30.0, abs=0.01)
        assert data["gross_dividend"] == pytest.approx(100.0, abs=0.01)


class TestBudgetEndpoint:
    def test_budget_summary(self, client: TestClient, session: Session):
        seed_db(session)
        now = datetime.utcnow()
        r = client.get(f"/api/budget/summary?year={now.year}&month={now.month}")
        assert r.status_code == 200
        data = r.json()
        assert "total_income" in data
        assert "total_expenses" in data
        assert "net_savings" in data

    def test_cash_balances(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/cash/balances")
        assert r.status_code == 200
        balances = r.json()
        assert "CBA" in balances
        assert balances["CBA"] == pytest.approx(32500.0)


class TestFIREEndpoint:
    def test_fire_projection(self, client: TestClient):
        r = client.post("/api/fire/projection", json={
            "current_net_worth": 250000,
            "annual_savings": 40000,
            "target_annual_spend": 60000,
            "investment_return_rate": 0.07,
            "inflation_rate": 0.03,
            "safe_withdrawal_rate": 0.04,
            "current_age": 35,
            "target_retire_age": 55,
            "years_to_project": 30,
        })
        assert r.status_code == 200
        data = r.json()
        assert data["fire_number"] == pytest.approx(1_500_000.0)
        assert data["years_to_fire"] is not None
        assert len(data["trajectory"]) == 30

    def test_fire_inputs_from_settings(self, client: TestClient, session: Session):
        seed_db(session)
        r = client.get("/api/fire/inputs")
        assert r.status_code == 200
        data = r.json()
        assert "current_net_worth" in data
        assert data["safe_withdrawal_rate"] == pytest.approx(0.04)
