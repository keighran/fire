from __future__ import annotations
"""
Admin-only API endpoints. Access restricted to users whose email is in ADMIN_EMAILS.
"""
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.auth.clerk import get_current_user
from app.db import get_session
from app.middleware.rate_limit import limiter, LIMIT_WRITE
from app.models import (
    Account, Subscription, SubscriptionStatus, SubscriptionTier, Transaction, User, UserSettings,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_EMAILS: set[str] = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "admin@astradigital.com.au").split(",")
    if e.strip()
}


def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if current_user.email.lower() not in ADMIN_EMAILS:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return current_user


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

@router.get("/stats")
def admin_stats(
    _: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    total_users = db.exec(select(func.count(User.id))).one()
    total_transactions = db.exec(select(func.count(Transaction.id))).one()
    total_accounts = db.exec(select(func.count(Account.id))).one()

    tier_counts: dict[str, int] = {t.value: 0 for t in SubscriptionTier}
    subs = db.exec(select(Subscription)).all()
    for sub in subs:
        if sub.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING):
            tier_counts[sub.tier.value] = tier_counts.get(sub.tier.value, 0) + 1

    # Users with no subscription row default to FREE.
    users_with_sub = len(subs)
    tier_counts[SubscriptionTier.FREE.value] += max(0, total_users - users_with_sub)

    return {
        "total_users": total_users,
        "total_transactions": total_transactions,
        "total_accounts": total_accounts,
        "users_by_tier": tier_counts,
    }


# ---------------------------------------------------------------------------
# User list
# ---------------------------------------------------------------------------

@router.get("/users")
def admin_list_users(
    search: Optional[str] = None,
    _: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    query = select(User)
    if search:
        query = query.where(User.email.ilike(f"%{search}%"))
    users = db.exec(query.order_by(User.created_at.desc())).all()

    result = []
    for user in users:
        sub = db.exec(select(Subscription).where(Subscription.user_id == user.id)).first()
        tx_count = db.exec(
            select(func.count(Transaction.id))
            .join(Account)
            .where(Account.user_id == user.id)
        ).one()
        account_count = db.exec(
            select(func.count(Account.id)).where(Account.user_id == user.id)
        ).one()

        result.append({
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat(),
            "tier": sub.tier.value if sub else SubscriptionTier.FREE.value,
            "sub_status": sub.status.value if sub else None,
            "stripe_customer_id": sub.stripe_customer_id if sub else None,
            "transaction_count": tx_count,
            "account_count": account_count,
        })

    return result


# ---------------------------------------------------------------------------
# Tier management
# ---------------------------------------------------------------------------

class TierUpdate(BaseModel):
    tier: SubscriptionTier


@router.put("/users/{user_id}/tier")
@limiter.limit(LIMIT_WRITE)
def admin_set_tier(
    request: Request,
    user_id: int,
    body: TierUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    if user_id == admin.id:
        raise HTTPException(400, "Cannot change your own tier via admin panel")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    sub = db.exec(select(Subscription).where(Subscription.user_id == user_id)).first()
    if sub:
        sub.tier = body.tier
        sub.status = SubscriptionStatus.ACTIVE
        sub.updated_at = datetime.utcnow()
    else:
        sub = Subscription(
            user_id=user_id,
            tier=body.tier,
            status=SubscriptionStatus.ACTIVE,
        )
        db.add(sub)

    db.commit()
    return {"user_id": user_id, "tier": body.tier.value}


# ---------------------------------------------------------------------------
# Toggle active / suspend
# ---------------------------------------------------------------------------

@router.put("/users/{user_id}/active")
@limiter.limit(LIMIT_WRITE)
def admin_toggle_active(
    request: Request,
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    if user_id == admin.id:
        raise HTTPException(400, "Cannot suspend yourself")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    user.is_active = not user.is_active
    db.add(user)
    db.commit()
    return {"user_id": user_id, "is_active": user.is_active}


# ---------------------------------------------------------------------------
# Delete user
# ---------------------------------------------------------------------------

@router.delete("/users/{user_id}")
@limiter.limit(LIMIT_WRITE)
def admin_delete_user(
    request: Request,
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_session),
):
    if user_id == admin.id:
        raise HTTPException(400, "Cannot delete yourself")

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    db.delete(user)
    db.commit()
    return {"deleted": user_id}
