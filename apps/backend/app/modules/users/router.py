from fastapi import APIRouter, Depends

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_admin, require_admin_or_own_user
from app.modules.users.dto import CreateUserRequest, UpdateUserRequest, UserResponse
from app.modules.users.service import UsersService

router = APIRouter(prefix="/users", tags=["users"])


def get_users_service() -> UsersService:
    return UsersService(DatabaseClient)


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(
    payload: CreateUserRequest,
    service: UsersService = Depends(get_users_service),
    _: UserResponse = Depends(require_admin),
):
    """Create a new user. Admin only."""
    return await service.create(payload)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    service: UsersService = Depends(get_users_service),
    _: UserResponse = Depends(require_admin_or_own_user),
):
    return await service.find_by_id(user_id)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    service: UsersService = Depends(get_users_service),
    _: UserResponse = Depends(require_admin_or_own_user),
):
    return await service.update(user_id, payload)


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: str,
    service: UsersService = Depends(get_users_service),
    _: UserResponse = Depends(require_admin),
):
    """Deactivate a user by setting ``is_active`` to ``false``. Admin only.

    The user will no longer be able to log in.  Use ``PATCH /users/{user_id}``
    with ``{"is_active": true}`` to reactivate.
    """
    return await service.deactivate(user_id)


@router.get("/", response_model=list[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    service: UsersService = Depends(get_users_service),
    _: UserResponse = Depends(require_admin),
):
    return await service.list_all(skip, limit)
