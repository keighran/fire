"""initial_schema

Revision ID: 001
Revises:
Create Date: 2026-06-17

Creates the base tables: users, user_settings, accounts, assets, transactions, monthly_snapshots
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "user_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("base_currency", sa.String(10), nullable=False, server_default="AUD"),
        sa.Column("pay_frequency", sa.String(50), nullable=True),
        sa.Column("pay_day_of_month", sa.Integer(), nullable=True),
        sa.Column("employment_salary", sa.Numeric(15, 2), nullable=True),
        sa.Column("marginal_tax_rate", sa.Numeric(5, 4), nullable=True),
        sa.Column("default_brokerage_fee", sa.Numeric(10, 2), nullable=True),
        sa.Column("bank_interest_rate", sa.Numeric(5, 4), nullable=True),
        sa.Column("emergency_fund_months", sa.Integer(), nullable=True, server_default="3"),
        sa.Column("use_budget", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("cgt_method", sa.String(20), nullable=False, server_default="FIFO"),
        sa.Column("fire_target_annual_spend", sa.Numeric(15, 2), nullable=True),
        sa.Column("fire_safe_withdrawal_rate", sa.Numeric(5, 4), nullable=True, server_default="0.04"),
        sa.Column("fire_investment_return_rate", sa.Numeric(5, 4), nullable=True, server_default="0.07"),
        sa.Column("fire_inflation_rate", sa.Numeric(5, 4), nullable=True, server_default="0.03"),
        sa.Column("fire_current_age", sa.Integer(), nullable=True),
        sa.Column("fire_target_retire_age", sa.Integer(), nullable=True),
        sa.Column("fire_life_expectancy", sa.Integer(), nullable=True, server_default="90"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("account_type", sa.String(50), nullable=False),
        sa.Column("institution", sa.String(255), nullable=True),
        sa.Column("currency", sa.String(10), nullable=False, server_default="AUD"),
        sa.Column("is_retirement", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_accounts_user_id", "accounts", ["user_id"])

    op.create_table(
        "assets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticker", sa.String(20), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("asset_class", sa.String(50), nullable=False),
        sa.Column("current_price", sa.Numeric(20, 6), nullable=True),
        sa.Column("price_updated_at", sa.DateTime(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_assets_account_id", "assets", ["account_id"])
    op.create_index("ix_assets_ticker", "assets", ["ticker"])

    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_id", sa.Integer(), sa.ForeignKey("assets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("transaction_type", sa.String(20), nullable=False),
        sa.Column("ticker", sa.String(20), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("units", sa.Numeric(20, 8), nullable=True),
        sa.Column("price_per_unit", sa.Numeric(20, 6), nullable=True),
        sa.Column("amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("fees", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(10), nullable=False, server_default="AUD"),
        sa.Column("fx_rate", sa.Numeric(10, 6), nullable=False, server_default="1"),
        sa.Column("franking_percentage", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_transactions_account_id", "transactions", ["account_id"])
    op.create_index("ix_transactions_date", "transactions", ["date"])
    op.create_index("ix_transactions_ticker", "transactions", ["ticker"])

    op.create_table(
        "monthly_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("net_worth", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("total_assets", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("total_liabilities", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("cash_value", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("etf_value", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("shares_value", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("super_value", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("crypto_value", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("property_current_value", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("managed_funds_value", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("other_assets_value", sa.Numeric(20, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_monthly_snapshots_user_id", "monthly_snapshots", ["user_id"])
    op.create_index("ix_monthly_snapshots_date", "monthly_snapshots", ["snapshot_date"])


def downgrade() -> None:
    op.drop_table("monthly_snapshots")
    op.drop_table("transactions")
    op.drop_table("assets")
    op.drop_table("accounts")
    op.drop_table("user_settings")
    op.drop_table("users")
