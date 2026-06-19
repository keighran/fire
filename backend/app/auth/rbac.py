from __future__ import annotations
"""
Role-Based Access Control — tier gates for SaaS features.

Usage in routes:
    @router.post("/fire/projection")
    def fire_projection(
        body: ...,
        current_user: User = Depends(require_tier(SubscriptionTier.PRO)),
        db: Session = Depends(get_session),
    ):
        ...
"""
from datetime import datetime
from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlmodel import Session, select

from app.auth.clerk import get_current_user
from app.db import get_session
from app.models import Subscription, SubscriptionStatus, SubscriptionTier, User

# Numeric rank so comparisons are straightforward.
_TIER_RANK: dict[SubscriptionTier, int] = {
    SubscriptionTier.FREE: 0,
    SubscriptionTier.PRO: 1,
    SubscriptionTier.ENTERPRISE: 2,
}

# Free-tier transaction cap.
FREE_TRANSACTION_LIMIT = 50


def get_user_tier(db: Session, user_id: int) -> SubscriptionTier:
    """Returns the effective tier for a user. Defaults to FREE if no record found."""
    sub = db.exec(select(Subscription).where(Subscription.user_id == user_id)).first()
    if sub is None:
        return SubscriptionTier.FREE

    # Treat past_due as still active (grace period), canceled as FREE.
    if sub.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE):
        # Also check period end hasn't passed for canceled subs.
        if sub.current_period_end and sub.current_period_end < datetime.utcnow():
            return SubscriptionTier.FREE
        return sub.tier

    return SubscriptionTier.FREE


def require_tier(minimum_tier: SubscriptionTier) -> Callable:
    """
    Dependency factory that raises 403 if the user's subscription is below
    `minimum_tier`. Returns the User object on success.

    Example:
        Depends(require_tier(SubscriptionTier.PRO))
    """
    def _check(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_session),
    ) -> User:
        effective_tier = get_user_tier(db, current_user.id)
        if _TIER_RANK[effective_tier] < _TIER_RANK[minimum_tier]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "SUBSCRIPTION_REQUIRED",
                    "message": f"This feature requires a {minimum_tier.value} subscription.",
                    "required_tier": minimum_tier.value,
                    "current_tier": effective_tier.value,
                    "upgrade_url": "/pricing",
                },
            )
        return current_user

    return _check


def check_transaction_limit(db: Session, user_id: int, new_count: int = 1) -> None:
    """
    Raises 403 if a FREE user tries to exceed FREE_TRANSACTION_LIMIT transactions.
    PRO/Enterprise users have no limit.
    """
    from app.models import Account, Transaction
    from sqlmodel import func

    tier = get_user_tier(db, user_id)
    if _TIER_RANK[tier] >= _TIER_RANK[SubscriptionTier.PRO]:
        return

    total = db.exec(
        select(func.count(Transaction.id))
        .join(Account)
        .where(Account.user_id == user_id)
    ).one()

    if (total + new_count) > FREE_TRANSACTION_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "TRANSACTION_LIMIT_REACHED",
                "message": f"Free tier is limited to {FREE_TRANSACTION_LIMIT} transactions. Upgrade to Pro for unlimited access.",
                "upgrade_url": "/pricing",
            },
        )
