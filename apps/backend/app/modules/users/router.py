from fastapi import APIRouter, Depends

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_own_user, require_user
from app.modules.users.dto import CreateUserRequest, UpdateUserRequest, UserResponse
from app.modules.users.service import UsersService

router = APIRouter(prefix="/users", tags=["users"])


def get_users_service() -> UsersService:
    return UsersService(DatabaseClient)


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(payload: CreateUserRequest, service: UsersService = Depends(get_users_service)):
    return await service.create(payload)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    service: UsersService = Depends(get_users_service),
    _: dict = Depends(require_own_user),
):
    return await service.find_by_id(user_id)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    service: UsersService = Depends(get_users_service),
    _: dict = Depends(require_own_user),
):
    return await service.update(user_id, payload)


@router.delete("/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    service: UsersService = Depends(get_users_service),
    _: dict = Depends(require_own_user),
):
    await service.delete(user_id)


@router.get("/", response_model=list[UserResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    service: UsersService = Depends(get_users_service),
    _: dict = Depends(require_user),
):
    return await service.list_all(skip, limit)
