"""saas_additions

Revision ID: 002
Revises: 001
Create Date: 2026-06-17

Adds:
  - users.clerk_user_id (unique, nullable)
  - users.hashed_password nullable
  - subscriptions table
  - Composite indexes on transactions and monthly_snapshots
  - Cascading deletes wired at the DB level
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- users: add clerk_user_id, make hashed_password nullable ----
    op.add_column("users", sa.Column("clerk_user_id", sa.String(128), nullable=True))
    op.create_index("ix_users_clerk_user_id", "users", ["clerk_user_id"], unique=True)

    op.alter_column("users", "hashed_password",
                    existing_type=sa.String(),
                    nullable=True)

    # ---- subscriptions table ----
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("tier", sa.String(32), nullable=False, server_default="free"),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("stripe_customer_id", sa.String(100), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(100), nullable=True),
        sa.Column("stripe_price_id", sa.String(100), nullable=True),
        sa.Column("current_period_start", sa.DateTime(), nullable=True),
        sa.Column("current_period_end", sa.DateTime(), nullable=True),
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])
    op.create_index("ix_subscriptions_stripe_customer_id", "subscriptions", ["stripe_customer_id"])
    op.create_index("ix_subscriptions_stripe_subscription_id", "subscriptions", ["stripe_subscription_id"])

    # ---- Composite indexes ----
    op.create_index("ix_transactions_account_date", "transactions", ["account_id", "date"])
    op.create_index("ix_transactions_asset_type", "transactions", ["asset_id", "transaction_type"])
    op.create_index("ix_snapshots_user_date", "monthly_snapshots", ["user_id", "snapshot_date"])
    op.create_index("ix_accounts_user_type", "accounts", ["user_id", "account_type"])

    # ---- Cascading deletes at DB level (complement ORM-level cascades) ----
    # accounts → transactions
    op.drop_constraint("transactions_account_id_fkey", "transactions", type_="foreignkey")
    op.create_foreign_key(
        "transactions_account_id_fkey", "transactions", "accounts",
        ["account_id"], ["id"], ondelete="CASCADE"
    )
    # users → accounts
    op.drop_constraint("accounts_user_id_fkey", "accounts", type_="foreignkey")
    op.create_foreign_key(
        "accounts_user_id_fkey", "accounts", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    # users → user_settings
    op.drop_constraint("user_settings_user_id_fkey", "user_settings", type_="foreignkey")
    op.create_foreign_key(
        "user_settings_user_id_fkey", "user_settings", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )
    # users → monthly_snapshots
    op.drop_constraint("monthly_snapshots_user_id_fkey", "monthly_snapshots", type_="foreignkey")
    op.create_foreign_key(
        "monthly_snapshots_user_id_fkey", "monthly_snapshots", "users",
        ["user_id"], ["id"], ondelete="CASCADE"
    )


def downgrade() -> None:
    op.drop_index("ix_accounts_user_type", "accounts")
    op.drop_index("ix_snapshots_user_date", "monthly_snapshots")
    op.drop_index("ix_transactions_asset_type", "transactions")
    op.drop_index("ix_transactions_account_date", "transactions")

    op.drop_table("subscriptions")

    op.drop_index("ix_users_clerk_user_id", "users")
    op.drop_column("users", "clerk_user_id")
    op.alter_column("users", "hashed_password",
                    existing_type=sa.String(),
                    nullable=False)
