from fastapi import APIRouter, Depends

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.notifications.dto import NotificationResponse
from app.modules.notifications.service import NotificationsService
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


def get_notifications_service() -> NotificationsService:
    return NotificationsService(DatabaseClient)


@router.get("/", response_model=list[NotificationResponse])
async def list_notifications(
    unread_only: bool = False,
    skip: int = 0,
    limit: int = 100,
    service: NotificationsService = Depends(get_notifications_service),
    current_user: UserResponse = Depends(require_user),
):
    """List notifications for the authenticated user, newest first."""
    return await service.list_by_user(current_user.id, unread_only, skip, limit)


@router.get("/unread-count", response_model=int)
async def unread_count(
    service: NotificationsService = Depends(get_notifications_service),
    current_user: UserResponse = Depends(require_user),
):
    """Return the number of unread notifications."""
    return await service.unread_count(current_user.id)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(
    notification_id: str,
    service: NotificationsService = Depends(get_notifications_service),
    current_user: UserResponse = Depends(require_user),
):
    """Mark a single notification as read."""
    return await service.mark_as_read(notification_id, current_user.id)


@router.patch("/read-all", response_model=dict)
async def mark_all_read(
    service: NotificationsService = Depends(get_notifications_service),
    current_user: UserResponse = Depends(require_user),
):
    """Mark all unread notifications as read."""
    count = await service.mark_all_as_read(current_user.id)
    return {"marked_read": count}
