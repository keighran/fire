from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Index
from sqlmodel import Field, Relationship, SQLModel


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class AccountType(str, Enum):
    CASH = "Cash"
    BROKERAGE = "Brokerage"
    SUPER = "Super"
    CRYPTO = "Crypto"
    PROPERTY = "Property"
    LIABILITY = "Liability"
    OTHER_ASSET = "Other Asset"


class TransactionType(str, Enum):
    BUY = "Buy"
    SELL = "Sell"
    DEPOSIT = "Deposit"
    WITHDRAWAL = "Withdrawal"
    DIVIDEND = "Dividend"
    INTEREST = "Interest"
    EXPENSE = "Expense"
    INCOME = "Income"


class AssetClass(str, Enum):
    ETF = "ETF"
    STOCK = "Stock"
    MANAGED_FUND = "Managed Fund"
    CRYPTO = "Crypto"
    CASH = "Cash"
    PROPERTY = "Property"
    OTHER = "Other"


class PayFrequency(str, Enum):
    WEEKLY = "Weekly"
    FORTNIGHTLY = "Fortnightly"
    TWICE_MONTHLY = "Twice Monthly"
    FOUR_WEEKLY = "4-weeks"
    MONTHLY = "Monthly"


class CGTMethod(str, Enum):
    FIFO = "FIFO"
    MANUAL = "Manual"


class SubscriptionTier(str, Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    TRIALING = "trialing"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    INCOMPLETE = "incomplete"


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=255)
    display_name: str = Field(default="", max_length=100)
    # Nullable — legacy password stub; Clerk is the primary auth provider.
    hashed_password: str | None = Field(default=None)
    # Clerk user ID (e.g. "user_2abc..."). Unique index for fast JWT lookup.
    clerk_user_id: str | None = Field(default=None, index=True, unique=True, max_length=128)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)

    accounts: list[Account] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    settings: UserSettings | None = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    subscription: Subscription | None = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    monthly_snapshots: list[MonthlySnapshot] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ---------------------------------------------------------------------------
# Subscription  (SaaS billing state, synced from Stripe webhooks)
# ---------------------------------------------------------------------------

class Subscription(SQLModel, table=True):
    __tablename__ = "subscriptions"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True, index=True)
    tier: SubscriptionTier = Field(default=SubscriptionTier.FREE)
    status: SubscriptionStatus = Field(default=SubscriptionStatus.ACTIVE)
    stripe_customer_id: str | None = Field(default=None, index=True, max_length=100)
    stripe_subscription_id: str | None = Field(default=None, index=True, max_length=100)
    stripe_price_id: str | None = Field(default=None, max_length=100)
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    cancel_at_period_end: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: User | None = Relationship(back_populates="subscription")


# ---------------------------------------------------------------------------
# UserSettings  (replaces SheetOptions tab)
# ---------------------------------------------------------------------------

class UserSettings(SQLModel, table=True):
    __tablename__ = "user_settings"

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", unique=True)

    base_currency: str = Field(default="AUD", max_length=3)
    pay_frequency: PayFrequency = Field(default=PayFrequency.FORTNIGHTLY)
    pay_day_of_month: int = Field(default=1)
    employment_salary: Decimal = Field(default=Decimal("0.00"), max_digits=12, decimal_places=2)

    default_brokerage_fee: Decimal = Field(default=Decimal("9.95"), max_digits=8, decimal_places=2)

    cgt_method: CGTMethod = Field(default=CGTMethod.FIFO)
    marginal_tax_rate: Decimal = Field(default=Decimal("0.325"), max_digits=5, decimal_places=4)

    use_budget: bool = Field(default=True)
    emergency_fund_months: int = Field(default=3)

    fire_safe_withdrawal_rate: Decimal = Field(default=Decimal("0.04"), max_digits=5, decimal_places=4)
    fire_investment_return_rate: Decimal = Field(default=Decimal("0.07"), max_digits=5, decimal_places=4)
    fire_inflation_rate: Decimal = Field(default=Decimal("0.03"), max_digits=5, decimal_places=4)
    fire_target_annual_spend: Decimal = Field(default=Decimal("0.00"), max_digits=12, decimal_places=2)
    fire_current_age: int | None = None
    fire_target_retire_age: int | None = None
    fire_life_expectancy: int = Field(default=90)

    bank_interest_rate: Decimal = Field(default=Decimal("0.05"), max_digits=5, decimal_places=4)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    user: User | None = Relationship(back_populates="settings")


# ---------------------------------------------------------------------------
# Account
# ---------------------------------------------------------------------------

class Account(SQLModel, table=True):
    __tablename__ = "accounts"
    __table_args__ = (
        Index("ix_accounts_user_type", "user_id", "type"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str = Field(index=True, max_length=100)
    type: AccountType
    institution: str = Field(default="", max_length=100)
    currency: str = Field(default="AUD", max_length=3)
    is_retirement: bool = Field(default=False)
    notes: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: User | None = Relationship(back_populates="accounts")
    transactions: list[Transaction] = Relationship(
        back_populates="account",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ---------------------------------------------------------------------------
# Asset  (shared registry — not user-scoped, prices are global)
# ---------------------------------------------------------------------------

class Asset(SQLModel, table=True):
    __tablename__ = "assets"

    id: int | None = Field(default=None, primary_key=True)
    ticker: str = Field(index=True, unique=True, max_length=50)
    name: str = Field(max_length=200)
    category: AccountType
    asset_class: AssetClass = Field(default=AssetClass.OTHER)
    current_price: Decimal = Field(default=Decimal("0.0000"), max_digits=18, decimal_places=4)
    last_updated: datetime = Field(default_factory=datetime.utcnow)

    transactions: list[Transaction] = Relationship(back_populates="asset")


# ---------------------------------------------------------------------------
# Transaction
# ---------------------------------------------------------------------------

class Transaction(SQLModel, table=True):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_account_date", "account_id", "date"),
        Index("ix_transactions_asset_type", "asset_id", "type"),
        Index("ix_transactions_date", "date"),
    )

    id: int | None = Field(default=None, primary_key=True)
    account_id: int = Field(foreign_key="accounts.id", index=True)
    asset_id: int | None = Field(foreign_key="assets.id", default=None, index=True)

    type: TransactionType
    date: datetime = Field(index=True)

    units: Decimal | None = Field(default=None, max_digits=18, decimal_places=8)
    price_per_unit: Decimal | None = Field(default=None, max_digits=18, decimal_places=4)

    # GROSS transaction value. Net = amount - fees.
    # ATO cost base: cost_base = amount + fees (brokerage capitalised on BUY).
    amount: Decimal = Field(max_digits=18, decimal_places=2)
    fees: Decimal = Field(default=Decimal("0.00"), max_digits=10, decimal_places=2)

    franking_percentage: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    is_drp: bool = Field(default=False)
    notes: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    account: Account | None = Relationship(back_populates="transactions")
    asset: Asset | None = Relationship(back_populates="transactions")

    @property
    def tax_year(self) -> str:
        if self.date.month >= 7:
            return f"{self.date.year}-{str(self.date.year + 1)[2:]}"
        return f"{self.date.year - 1}-{str(self.date.year)[2:]}"

    @property
    def cost_base_contribution(self) -> Decimal:
        if self.type == TransactionType.BUY:
            return self.amount + self.fees
        return Decimal("0.00")

    @property
    def net_proceeds(self) -> Decimal:
        if self.type == TransactionType.SELL:
            return self.amount - self.fees
        return Decimal("0.00")


# ---------------------------------------------------------------------------
# MonthlySnapshot  (replaces the History tab)
# ---------------------------------------------------------------------------

class MonthlySnapshot(SQLModel, table=True):
    __tablename__ = "monthly_snapshots"
    __table_args__ = (
        Index("ix_snapshots_user_date", "user_id", "snapshot_date"),
    )

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    snapshot_date: datetime = Field(index=True)

    shares_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    shares_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    etf_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    etf_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    crypto_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    crypto_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    managed_fund_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    managed_fund_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    cash_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    cash_increase: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    super_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    super_voluntary_contrib: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    super_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_current_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_purchase_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_equity: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_mortgage_balance: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_interest_fees: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    property_principal_paid: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    other_assets_value: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    other_assets_gain: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    liabilities_balance: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    liabilities_paid: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    salary_income: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    total_assets: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    total_liabilities: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    net_worth: Decimal = Field(default=Decimal("0.00"), max_digits=18, decimal_places=2)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: User | None = Relationship(back_populates="monthly_snapshots")
