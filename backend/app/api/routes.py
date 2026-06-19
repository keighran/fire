"""
FastAPI routers — all application endpoints.
Authentication via Clerk JWT (get_current_user dependency).
Tier gates via require_tier().
Rate limits via @limiter.limit().
"""
import os
from dataclasses import asdict
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth.clerk import get_current_user
from app.auth.rbac import check_transaction_limit, require_tier
from app.db import get_session
from app.middleware.rate_limit import limiter, LIMIT_PRICE_REFRESH, LIMIT_WRITE, LIMIT_ANON
from app.models import (
    Account,
    AccountType,
    Asset,
    AssetClass,
    Subscription,
    SubscriptionTier,
    Transaction,
    TransactionType,
    User,
    UserSettings,
    PayFrequency,
    CGTMethod,
)
from app.services.cash_service import BudgetEngine, CashEngine, LiabilityEngine, SideIncomeEngine
from app.services.equity_service import EquityEngine
from app.services.fire_service import FIREEngine, FIREInputs
from app.services.networth_service import NetWorthAggregator
from app.services.pricing_service import CryptoEngine, LivePricingEngine
from app.services.property_service import PropertyEngine
from app.services.tax_service import AustralianTaxEngine

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Pydantic request schemas
# ---------------------------------------------------------------------------

class AccountCreate(BaseModel):
    name: str
    type: AccountType
    institution: str = ""
    currency: str = "AUD"
    is_retirement: bool = False
    notes: Optional[str] = None


class AssetCreate(BaseModel):
    ticker: str
    name: str
    category: AccountType
    asset_class: AssetClass = AssetClass.OTHER


class TransactionCreate(BaseModel):
    account_id: int
    asset_id: Optional[int] = None
    type: TransactionType
    date: datetime
    units: Optional[Decimal] = None
    price_per_unit: Optional[Decimal] = None
    amount: Decimal
    fees: Decimal = Decimal("0.00")
    franking_percentage: Optional[Decimal] = None
    is_drp: bool = False
    notes: Optional[str] = None


class TransactionUpdate(BaseModel):
    type: Optional[TransactionType] = None
    date: Optional[datetime] = None
    units: Optional[Decimal] = None
    price_per_unit: Optional[Decimal] = None
    amount: Optional[Decimal] = None
    fees: Optional[Decimal] = None
    franking_percentage: Optional[Decimal] = None
    is_drp: Optional[bool] = None
    notes: Optional[str] = None


class FIREProjectionRequest(BaseModel):
    current_net_worth: float
    annual_savings: float
    target_annual_spend: float
    investment_return_rate: float = 0.07
    inflation_rate: float = 0.03
    safe_withdrawal_rate: float = 0.04
    current_age: int
    target_retire_age: int
    life_expectancy: int = 90
    years_to_project: int = 50


class UserSettingsUpdate(BaseModel):
    base_currency: Optional[str] = None
    pay_frequency: Optional[PayFrequency] = None
    employment_salary: Optional[Decimal] = None
    default_brokerage_fee: Optional[Decimal] = None
    cgt_method: Optional[CGTMethod] = None
    marginal_tax_rate: Optional[Decimal] = None
    use_budget: Optional[bool] = None
    emergency_fund_months: Optional[int] = None
    fire_safe_withdrawal_rate: Optional[Decimal] = None
    fire_investment_return_rate: Optional[Decimal] = None
    fire_inflation_rate: Optional[Decimal] = None
    fire_target_annual_spend: Optional[Decimal] = None
    fire_current_age: Optional[int] = None
    fire_target_retire_age: Optional[int] = None
    fire_life_expectancy: Optional[int] = None
    bank_interest_rate: Optional[Decimal] = None
    pay_day_of_month: Optional[int] = None


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    institution: Optional[str] = None
    currency: Optional[str] = None
    is_retirement: Optional[bool] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@router.get("/health")
@limiter.limit(LIMIT_ANON)
def health(request: Request):
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ---------------------------------------------------------------------------
# User / Settings
# ---------------------------------------------------------------------------

@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    from app.auth.rbac import get_user_tier
    tier = get_user_tier(db, current_user.id)
    return {
        "id": current_user.id,
        "email": current_user.email,
        "display_name": current_user.display_name,
        "clerk_user_id": current_user.clerk_user_id,
        "tier": tier.value,
        "created_at": current_user.created_at.isoformat(),
    }


@router.get("/settings")
def get_settings(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    s = db.exec(select(UserSettings).where(UserSettings.user_id == current_user.id)).first()
    if not s:
        raise HTTPException(404, "Settings not found — complete onboarding first")
    return {k: (float(v) if isinstance(v, Decimal) else v) for k, v in s.__dict__.items()
            if not k.startswith("_")}


@router.put("/settings")
@limiter.limit(LIMIT_WRITE)
def update_settings(
    request: Request,
    body: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    s = db.exec(select(UserSettings).where(UserSettings.user_id == current_user.id)).first()
    if not s:
        s = UserSettings(user_id=current_user.id)
        db.add(s)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(s, field, value)
    s.updated_at = datetime.utcnow()
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

@router.post("/accounts")
@limiter.limit(LIMIT_WRITE)
def create_account(
    request: Request,
    body: AccountCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    account = Account(user_id=current_user.id, **body.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.get("/accounts")
def list_accounts(current_user: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return db.exec(select(Account).where(Account.user_id == current_user.id)).all()


@router.put("/accounts/{account_id}")
@limiter.limit(LIMIT_WRITE)
def update_account(
    request: Request,
    account_id: int,
    body: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    account = db.exec(
        select(Account).where(Account.id == account_id, Account.user_id == current_user.id)
    ).first()
    if not account:
        raise HTTPException(404, "Account not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(account, field, value)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@router.delete("/accounts/{account_id}")
@limiter.limit(LIMIT_WRITE)
def delete_account(
    request: Request,
    account_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    account = db.exec(
        select(Account).where(Account.id == account_id, Account.user_id == current_user.id)
    ).first()
    if not account:
        raise HTTPException(404, "Account not found")
    db.delete(account)
    db.commit()
    return {"deleted": account_id}


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------

@router.post("/assets")
@limiter.limit(LIMIT_WRITE)
def create_asset(
    request: Request,
    body: AssetCreate,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    existing = db.exec(select(Asset).where(Asset.ticker == body.ticker)).first()
    if existing:
        raise HTTPException(400, f"Asset {body.ticker} already exists")
    asset = Asset(**body.model_dump())
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return asset


@router.get("/assets")
def list_assets(_: User = Depends(get_current_user), db: Session = Depends(get_session)):
    return db.exec(select(Asset)).all()


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@router.post("/transactions")
@limiter.limit(LIMIT_WRITE)
def create_transaction(
    request: Request,
    body: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    # Verify the account belongs to the authenticated user (RLS enforcement).
    account = db.exec(
        select(Account).where(Account.id == body.account_id, Account.user_id == current_user.id)
    ).first()
    if not account:
        raise HTTPException(404, "Account not found or does not belong to you")

    # Free-tier transaction cap check.
    check_transaction_limit(db, current_user.id)

    txn = Transaction(**body.model_dump())
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.get("/transactions")
def list_transactions(
    account_id: Optional[int] = None,
    asset_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    query = select(Transaction).join(Account).where(Account.user_id == current_user.id)
    if account_id:
        # Extra ownership check.
        account = db.exec(
            select(Account).where(Account.id == account_id, Account.user_id == current_user.id)
        ).first()
        if not account:
            raise HTTPException(404, "Account not found")
        query = query.where(Transaction.account_id == account_id)
    if asset_id:
        query = query.where(Transaction.asset_id == asset_id)
    return db.exec(query.order_by(Transaction.date.desc())).all()


@router.put("/transactions/{txn_id}")
@limiter.limit(LIMIT_WRITE)
def update_transaction(
    request: Request,
    txn_id: int,
    body: TransactionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    txn = db.exec(
        select(Transaction)
        .join(Account)
        .where(Transaction.id == txn_id, Account.user_id == current_user.id)
    ).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(txn, field, value)
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return txn


@router.delete("/transactions/{txn_id}")
@limiter.limit(LIMIT_WRITE)
def delete_transaction(
    request: Request,
    txn_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    txn = db.exec(
        select(Transaction)
        .join(Account)
        .where(Transaction.id == txn_id, Account.user_id == current_user.id)
    ).first()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    db.delete(txn)
    db.commit()
    return {"deleted": txn_id}


# ---------------------------------------------------------------------------
# Live Prices  (PRO — expensive yfinance calls)
# ---------------------------------------------------------------------------

@router.get("/prices")
@limiter.limit(LIMIT_PRICE_REFRESH)
def get_live_prices(
    request: Request,
    tickers: str,
    _: User = Depends(require_tier(SubscriptionTier.PRO)),
    db: Session = Depends(get_session),
):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    prices = LivePricingEngine.fetch_equity_prices(ticker_list)
    return {k: float(v) for k, v in prices.items()}


@router.post("/prices/refresh")
@limiter.limit(LIMIT_PRICE_REFRESH)
def refresh_all_prices(
    request: Request,
    _: User = Depends(require_tier(SubscriptionTier.PRO)),
    db: Session = Depends(get_session),
):
    equity_prices = LivePricingEngine.update_equity_prices(db)
    api_key = os.getenv("COINGECKO_API_KEY", "")
    crypto_prices = CryptoEngine.update_crypto_prices(db, api_key)
    return {
        "equity": {k: float(v) for k, v in equity_prices.items()},
        "crypto": {k: float(v) for k, v in crypto_prices.items()},
        "updated_at": datetime.utcnow().isoformat(),
    }


# ---------------------------------------------------------------------------
# Net Worth  (FREE)
# ---------------------------------------------------------------------------

@router.get("/net-worth")
def get_net_worth(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    snapshot = NetWorthAggregator.get_current_snapshot(db, user_id=current_user.id)
    return {k: float(v) if isinstance(v, Decimal) else v
            for k, v in snapshot.__dict__.items()}


@router.post("/net-worth/snapshot")
@limiter.limit(LIMIT_WRITE)
def record_snapshot(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    row = NetWorthAggregator.record_monthly_snapshot(db, user_id=current_user.id)
    return row


@router.get("/history")
def get_history(
    limit: int = 24,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    return NetWorthAggregator.get_history(db, user_id=current_user.id, limit=limit)


# ---------------------------------------------------------------------------
# Portfolio Holdings  (FREE — limited view; PRO — full)
# ---------------------------------------------------------------------------

@router.get("/holdings")
def get_holdings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    holdings = EquityEngine.calculate_portfolio_holdings(db, user_id=current_user.id)
    return [
        {k: float(v) if isinstance(v, Decimal) else
         (v.isoformat() if isinstance(v, datetime) else
          (v.value if hasattr(v, "value") else v))
         for k, v in asdict(h).items()}
        for h in holdings
    ]


# ---------------------------------------------------------------------------
# Dividends  (PRO)
# ---------------------------------------------------------------------------

@router.get("/dividends")
def get_dividends(
    current_user: User = Depends(require_tier(SubscriptionTier.PRO)),
    db: Session = Depends(get_session),
):
    divs = EquityEngine.get_dividend_history(db, user_id=current_user.id)
    return [
        {k: float(v) if isinstance(v, Decimal) else
         (v.isoformat() if isinstance(v, datetime) else v)
         for k, v in asdict(d).items()}
        for d in divs
    ]


@router.get("/dividends/fy-summary")
def get_dividend_fy_summary(
    current_user: User = Depends(require_tier(SubscriptionTier.PRO)),
    db: Session = Depends(get_session),
):
    summary = EquityEngine.get_dividend_fy_summary(db, user_id=current_user.id)
    return {k: {ik: float(iv) for ik, iv in v.items()} for k, v in summary.items()}


# ---------------------------------------------------------------------------
# CGT Report  (FREE = current FY only; PRO = all years)
# ---------------------------------------------------------------------------

@router.get("/cgt-report")
def get_cgt_report(
    tax_year: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    from app.auth.rbac import get_user_tier
    tier = get_user_tier(db, current_user.id)

    # Free users can only see the current Australian tax year.
    if tier == SubscriptionTier.FREE and not tax_year:
        now = datetime.utcnow()
        fy_year = now.year if now.month >= 7 else now.year - 1
        tax_year = f"{fy_year}-{str(fy_year + 1)[2:]}"

    report = AustralianTaxEngine.calculate_fifo_cgt_report(
        db, user_id=current_user.id, tax_year=tax_year
    )
    return {
        "total_gross_gain": float(report.total_gross_gain),
        "total_taxable_gain": float(report.total_taxable_gain),
        "total_losses": float(report.total_losses),
        "events": [
            {k: float(v) if isinstance(v, Decimal) else
             (v.isoformat() if isinstance(v, datetime) else v)
             for k, v in asdict(e).items()}
            for e in report.events
        ],
    }


@router.get("/tax/dividend-gross-up")
def dividend_gross_up(
    net_amount: float,
    franking_pct: float,
    _: User = Depends(get_current_user),
):
    result = AustralianTaxEngine.calculate_dividend_gross_up(
        Decimal(str(net_amount)), Decimal(str(franking_pct))
    )
    return {k: float(v) for k, v in result.items()}


# ---------------------------------------------------------------------------
# Cash & Budget  (FREE)
# ---------------------------------------------------------------------------

@router.get("/cash/balances")
def get_cash_balances(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    balances = CashEngine.get_cash_balances(db, user_id=current_user.id)
    return {k: float(v) for k, v in balances.items()}


@router.get("/budget/summary")
def get_budget_summary(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    summary = BudgetEngine.calculate_monthly_budget_summary(
        db, user_id=current_user.id, year=year, month=month
    )
    return {k: float(v) if isinstance(v, Decimal) else v for k, v in asdict(summary).items()}


@router.get("/liabilities")
def get_liabilities(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    balances = LiabilityEngine.get_liability_balances(db, user_id=current_user.id)
    return [
        {k: float(v) if isinstance(v, Decimal) else v for k, v in asdict(b).items()}
        for b in balances
    ]


# ---------------------------------------------------------------------------
# Property  (FREE)
# ---------------------------------------------------------------------------

@router.get("/property")
def get_property(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    metrics = PropertyEngine.get_property_metrics(db, user_id=current_user.id)
    return [
        {k: float(v) if isinstance(v, Decimal) else v for k, v in asdict(m).items()}
        for m in metrics
    ]


# ---------------------------------------------------------------------------
# FIRE Projection  (PRO)
# ---------------------------------------------------------------------------

@router.post("/fire/projection")
def fire_projection(
    body: FIREProjectionRequest,
    _: User = Depends(require_tier(SubscriptionTier.PRO)),
):
    inputs = FIREInputs(**{k: v for k, v in body.model_dump().items()
                           if k != "years_to_project"})
    result = FIREEngine.run_projection(inputs, years_to_project=body.years_to_project)
    return {
        "fire_number": result.fire_number,
        "years_to_fire": result.years_to_fire,
        "fire_date_year": result.fire_date_year,
        "current_shortfall": result.current_shortfall,
        "already_fire": result.already_fire,
        "trajectory": [asdict(y) for y in result.trajectory],
    }


@router.get("/fire/inputs")
def get_fire_inputs(
    current_user: User = Depends(require_tier(SubscriptionTier.PRO)),
    db: Session = Depends(get_session),
):
    settings = db.exec(select(UserSettings).where(UserSettings.user_id == current_user.id)).first()
    if not settings:
        raise HTTPException(404, "Settings not found")
    snapshot = NetWorthAggregator.get_current_snapshot(db, user_id=current_user.id)
    return {
        "current_net_worth": float(snapshot.net_worth),
        "investment_return_rate": float(settings.fire_investment_return_rate),
        "inflation_rate": float(settings.fire_inflation_rate),
        "safe_withdrawal_rate": float(settings.fire_safe_withdrawal_rate),
        "target_annual_spend": float(settings.fire_target_annual_spend),
        "current_age": settings.fire_current_age,
        "target_retire_age": settings.fire_target_retire_age,
        "life_expectancy": settings.fire_life_expectancy,
    }


# ---------------------------------------------------------------------------
# Budget History  (last N months of monthly summaries for charts)
# ---------------------------------------------------------------------------

@router.get("/budget/history")
def get_budget_history(
    months: int = 12,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    now = datetime.utcnow()
    year, month = now.year, now.month
    history = []
    for _ in range(months):
        summary = BudgetEngine.calculate_monthly_budget_summary(db, current_user.id, year, month)
        history.append({k: float(v) if isinstance(v, Decimal) else v for k, v in asdict(summary).items()})
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    history.reverse()
    return history


# ---------------------------------------------------------------------------
# Side Income
# ---------------------------------------------------------------------------

@router.get("/side-income/monthly")
def get_side_income_monthly(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    from app.services.cash_service import SideIncomeEngine
    data = SideIncomeEngine.get_monthly_side_income(db, user_id=current_user.id)
    return [{"month": d["month"], "amount": float(d["amount"])} for d in data]


@router.get("/side-income/rolling-average")
def get_side_income_rolling_avg(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    from app.services.cash_service import SideIncomeEngine
    avg = SideIncomeEngine.get_rolling_365_average(db, user_id=current_user.id)
    return {"rolling_365_avg": float(avg)}


# ---------------------------------------------------------------------------
# Super Summary
# ---------------------------------------------------------------------------

@router.get("/super/summary")
def get_super_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    from sqlalchemy import func as sqlfunc

    super_accounts = db.exec(
        select(Account).where(
            Account.user_id == current_user.id,
            Account.type == AccountType.SUPER,
        )
    ).all()

    accounts_detail = []
    total_employer_sg = Decimal("0")
    total_voluntary = Decimal("0")

    for acct in super_accounts:
        employer_sg = db.exec(
            select(sqlfunc.sum(Transaction.amount)).where(
                Transaction.account_id == acct.id,
                Transaction.type == TransactionType.DEPOSIT,
            )
        ).one() or Decimal("0")

        voluntary = db.exec(
            select(sqlfunc.sum(Transaction.amount)).where(
                Transaction.account_id == acct.id,
                Transaction.type == TransactionType.INCOME,
            )
        ).one() or Decimal("0")

        total_employer_sg += Decimal(str(employer_sg))
        total_voluntary += Decimal(str(voluntary))

        accounts_detail.append({
            "name": acct.name,
            "employer_sg": float(employer_sg),
            "voluntary": float(voluntary),
            "balance": float(employer_sg + voluntary),
        })

    # Get market value from equity holdings for super accounts.
    super_holdings = EquityEngine.calculate_portfolio_holdings(
        db, current_user.id, [AccountType.SUPER]
    )
    total_market_value = sum(h.market_value for h in super_holdings) if super_holdings else Decimal("0")

    total_contributions = total_employer_sg + total_voluntary
    if total_market_value > 0:
        total_gain = total_market_value - total_contributions
    else:
        total_market_value = total_contributions
        total_gain = Decimal("0")

    return {
        "total_balance": float(total_market_value),
        "total_employer_sg": float(total_employer_sg),
        "total_voluntary_contributions": float(total_voluntary),
        "total_gain": float(total_gain),
        "accounts": accounts_detail,
    }
