from __future__ import annotations
"""
Clerk webhook handler — syncs user lifecycle events into our database.

Events handled:
  - user.created  → create User + FREE Subscription row
  - user.updated  → update email / display_name
  - user.deleted  → soft-delete (is_active = False) or hard-delete

Register at: https://dashboard.clerk.com → Webhooks → Add Endpoint
  Endpoint URL: https://your-api.com/api/webhooks/clerk
  Events: user.created, user.updated, user.deleted
"""
import logging
import os

from fastapi import APIRouter, Header, HTTPException, Request, status
from svix.webhooks import Webhook, WebhookVerificationError
from sqlmodel import Session, select

from app.db import get_session
from app.models import Subscription, SubscriptionStatus, SubscriptionTier, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _verify_svix(payload: bytes, svix_id: str, svix_timestamp: str, svix_signature: str) -> dict:
    secret = os.environ.get("CLERK_WEBHOOK_SECRET", "")
    if not secret:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Webhook secret not configured")
    wh = Webhook(secret)
    try:
        return wh.verify(payload, {
            "svix-id": svix_id,
            "svix-timestamp": svix_timestamp,
            "svix-signature": svix_signature,
        })
    except WebhookVerificationError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid webhook signature")


@router.post("/clerk")
async def clerk_webhook(
    request: Request,
    svix_id: str = Header(..., alias="svix-id"),
    svix_timestamp: str = Header(..., alias="svix-timestamp"),
    svix_signature: str = Header(..., alias="svix-signature"),
):
    payload = await request.body()
    event = _verify_svix(payload, svix_id, svix_timestamp, svix_signature)

    event_type: str = event.get("type", "")
    data: dict = event.get("data", {})
    clerk_user_id: str = data.get("id", "")

    db: Session = next(get_session())

    try:
        if event_type == "user.created":
            _handle_user_created(db, clerk_user_id, data)
        elif event_type == "user.updated":
            _handle_user_updated(db, clerk_user_id, data)
        elif event_type == "user.deleted":
            _handle_user_deleted(db, clerk_user_id)
        else:
            logger.debug("Unhandled Clerk event: %s", event_type)
    except Exception as exc:
        logger.error("Error handling Clerk event %s: %s", event_type, exc)
        db.rollback()
        raise

    return {"status": "ok"}


def _primary_email(data: dict) -> str:
    primary_id = data.get("primary_email_address_id", "")
    for addr in data.get("email_addresses", []):
        if addr.get("id") == primary_id:
            return addr.get("email_address", "")
    addrs = data.get("email_addresses", [])
    return addrs[0].get("email_address", "") if addrs else ""


def _handle_user_created(db: Session, clerk_user_id: str, data: dict) -> None:
    existing = db.exec(select(User).where(User.clerk_user_id == clerk_user_id)).first()
    if existing:
        return  # Already provisioned via lazy creation in clerk.py

    first = data.get("first_name", "") or ""
    last = data.get("last_name", "") or ""
    display_name = f"{first} {last}".strip() or _primary_email(data).split("@")[0]

    user = User(
        clerk_user_id=clerk_user_id,
        email=_primary_email(data),
        display_name=display_name,
        is_active=True,
    )
    db.add(user)
    db.flush()

    sub = Subscription(
        user_id=user.id,
        tier=SubscriptionTier.FREE,
        status=SubscriptionStatus.ACTIVE,
    )
    db.add(sub)
    db.commit()
    logger.info("Provisioned user %s (clerk_id=%s)", user.email, clerk_user_id)


def _handle_user_updated(db: Session, clerk_user_id: str, data: dict) -> None:
    user = db.exec(select(User).where(User.clerk_user_id == clerk_user_id)).first()
    if not user:
        _handle_user_created(db, clerk_user_id, data)
        return

    first = data.get("first_name", "") or ""
    last = data.get("last_name", "") or ""
    display_name = f"{first} {last}".strip()
    if display_name:
        user.display_name = display_name

    new_email = _primary_email(data)
    if new_email:
        user.email = new_email

    db.add(user)
    db.commit()


def _handle_user_deleted(db: Session, clerk_user_id: str) -> None:
    user = db.exec(select(User).where(User.clerk_user_id == clerk_user_id)).first()
    if not user:
        return
    # Soft-delete: keeps financial data intact for potential account recovery.
    user.is_active = False
    db.add(user)
    db.commit()
    logger.info("Soft-deleted user clerk_id=%s", clerk_user_id)
