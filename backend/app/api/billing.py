from __future__ import annotations
"""
Stripe billing endpoints.

Endpoints:
  POST /api/billing/create-checkout-session  — start Stripe Checkout
  POST /api/billing/create-portal-session    — open Stripe Customer Portal
  POST /api/billing/webhook                  — receive Stripe events
  GET  /api/billing/subscription             — current subscription state
"""
import logging
import os
from datetime import datetime

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth.clerk import get_current_user
from app.db import get_session
from app.models import Subscription, SubscriptionStatus, SubscriptionTier, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/billing", tags=["billing"])

# ---------------------------------------------------------------------------
# Tier → Stripe Price ID mapping (set via environment variables)
# ---------------------------------------------------------------------------
PRICE_MAP: dict[str, SubscriptionTier] = {}


def _stripe() -> stripe.Stripe:
    key = os.environ.get("STRIPE_SECRET_KEY", "")
    if not key:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Stripe not configured")
    stripe.api_key = key
    return stripe


def _price_to_tier(price_id: str) -> SubscriptionTier:
    mapping = {
        os.environ.get("STRIPE_PRO_PRICE_ID", ""): SubscriptionTier.PRO,
        os.environ.get("STRIPE_ENTERPRISE_PRICE_ID", ""): SubscriptionTier.ENTERPRISE,
    }
    return mapping.get(price_id, SubscriptionTier.FREE)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class CheckoutRequest(BaseModel):
    price_id: str
    success_url: str = ""
    cancel_url: str = ""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/subscription")
def get_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    sub = db.exec(select(Subscription).where(Subscription.user_id == current_user.id)).first()
    if not sub:
        return {"tier": "free", "status": "active", "stripe_customer_id": None, "current_period_end": None}
    return {
        "tier": sub.tier.value,
        "status": sub.status.value,
        "stripe_customer_id": sub.stripe_customer_id,
        "stripe_subscription_id": sub.stripe_subscription_id,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "cancel_at_period_end": sub.cancel_at_period_end,
    }


@router.post("/create-checkout-session")
def create_checkout_session(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    s = _stripe()
    sub = db.exec(select(Subscription).where(Subscription.user_id == current_user.id)).first()

    # Re-use existing Stripe customer or create one.
    customer_id = sub.stripe_customer_id if sub else None
    if not customer_id:
        customer = stripe.Customer.create(
            email=current_user.email,
            name=current_user.display_name,
            metadata={"user_id": str(current_user.id), "clerk_user_id": current_user.clerk_user_id or ""},
        )
        customer_id = customer.id
        if sub:
            sub.stripe_customer_id = customer_id
            db.add(sub)
            db.commit()

    frontend_url = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": body.price_id, "quantity": 1}],
        success_url=body.success_url or f"{frontend_url}/billing?success=true",
        cancel_url=body.cancel_url or f"{frontend_url}/pricing?canceled=true",
        metadata={"user_id": str(current_user.id)},
        subscription_data={"metadata": {"user_id": str(current_user.id)}},
    )
    return {"url": session.url}


@router.post("/create-portal-session")
def create_portal_session(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
):
    _stripe()
    sub = db.exec(select(Subscription).where(Subscription.user_id == current_user.id)).first()
    if not sub or not sub.stripe_customer_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active subscription found")

    frontend_url = os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=f"{frontend_url}/billing",
    )
    return {"url": session.url}


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(..., alias="stripe-signature"),
    db: Session = Depends(get_session),
):
    _stripe()
    payload = await request.body()
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Stripe signature")

    event_type: str = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(db, data)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(db, data)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(db, data)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(db, data)
    else:
        logger.debug("Unhandled Stripe event: %s", event_type)

    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Webhook handlers
# ---------------------------------------------------------------------------

def _get_or_create_sub(db: Session, user_id: int) -> Subscription:
    sub = db.exec(select(Subscription).where(Subscription.user_id == user_id)).first()
    if not sub:
        sub = Subscription(user_id=user_id, tier=SubscriptionTier.FREE, status=SubscriptionStatus.ACTIVE)
        db.add(sub)
        db.flush()
    return sub


def _user_id_from_metadata(data: dict) -> int | None:
    uid = (data.get("metadata") or {}).get("user_id")
    return int(uid) if uid else None


def _handle_checkout_completed(db: Session, data: dict) -> None:
    user_id = _user_id_from_metadata(data)
    if not user_id:
        logger.warning("checkout.session.completed missing user_id in metadata")
        return

    stripe_subscription_id = data.get("subscription")
    if not stripe_subscription_id:
        return

    stripe_sub = stripe.Subscription.retrieve(stripe_subscription_id)
    price_id = stripe_sub["items"]["data"][0]["price"]["id"] if stripe_sub["items"]["data"] else ""
    tier = _price_to_tier(price_id)

    sub = _get_or_create_sub(db, user_id)
    sub.stripe_customer_id = data.get("customer")
    sub.stripe_subscription_id = stripe_subscription_id
    sub.stripe_price_id = price_id
    sub.tier = tier
    sub.status = SubscriptionStatus.ACTIVE
    sub.current_period_start = datetime.fromtimestamp(stripe_sub.get("current_period_start", 0))
    sub.current_period_end = datetime.fromtimestamp(stripe_sub.get("current_period_end", 0))
    sub.updated_at = datetime.utcnow()

    db.add(sub)
    db.commit()
    logger.info("Activated %s subscription for user_id=%s", tier.value, user_id)


def _handle_subscription_updated(db: Session, data: dict) -> None:
    stripe_subscription_id = data.get("id")
    sub = db.exec(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_subscription_id)
    ).first()
    if not sub:
        logger.warning("subscription.updated: no local sub for %s", stripe_subscription_id)
        return

    stripe_status = data.get("status", "")
    price_id = data["items"]["data"][0]["price"]["id"] if data.get("items", {}).get("data") else ""

    sub.tier = _price_to_tier(price_id) if price_id else sub.tier
    sub.stripe_price_id = price_id or sub.stripe_price_id
    sub.status = _map_stripe_status(stripe_status)
    sub.current_period_start = datetime.fromtimestamp(data.get("current_period_start", 0))
    sub.current_period_end = datetime.fromtimestamp(data.get("current_period_end", 0))
    sub.cancel_at_period_end = data.get("cancel_at_period_end", False)
    sub.updated_at = datetime.utcnow()

    db.add(sub)
    db.commit()


def _handle_subscription_deleted(db: Session, data: dict) -> None:
    stripe_subscription_id = data.get("id")
    sub = db.exec(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_subscription_id)
    ).first()
    if not sub:
        return

    sub.tier = SubscriptionTier.FREE
    sub.status = SubscriptionStatus.CANCELED
    sub.updated_at = datetime.utcnow()
    db.add(sub)
    db.commit()
    logger.info("Canceled subscription for user_id=%s", sub.user_id)


def _handle_payment_failed(db: Session, data: dict) -> None:
    stripe_subscription_id = data.get("subscription")
    if not stripe_subscription_id:
        return
    sub = db.exec(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_subscription_id)
    ).first()
    if sub:
        sub.status = SubscriptionStatus.PAST_DUE
        sub.updated_at = datetime.utcnow()
        db.add(sub)
        db.commit()


def _map_stripe_status(s: str) -> SubscriptionStatus:
    return {
        "active": SubscriptionStatus.ACTIVE,
        "trialing": SubscriptionStatus.TRIALING,
        "past_due": SubscriptionStatus.PAST_DUE,
        "canceled": SubscriptionStatus.CANCELED,
        "incomplete": SubscriptionStatus.INCOMPLETE,
    }.get(s, SubscriptionStatus.ACTIVE)
