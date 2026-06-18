from typing import Optional

from fastapi import APIRouter, Depends

from app.db.client import DatabaseClient
from app.modules.audit.dto import AuditLogResponse
from app.modules.audit.service import AuditService
from app.modules.auth.deps import require_admin
from app.modules.users.dto import UserResponse

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


def get_audit_service() -> AuditService:
    return AuditService(DatabaseClient)


@router.get("/", response_model=list[AuditLogResponse])
async def list_audit_logs(
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    service: AuditService = Depends(get_audit_service),
    _: UserResponse = Depends(require_admin),
):
    """List audit logs. Admin only. Filterable by user, action, or resource type."""
    return await service.list_logs(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        skip=skip,
        limit=limit,
    )
