from fastapi import APIRouter, Depends

from app.db.client import DatabaseClient
from app.modules.auth.deps import require_user
from app.modules.auth.dto import RegisterRequest, LoginRequest, TokenResponse, AuthResponse
from app.modules.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def get_auth_service() -> AuthService:
    return AuthService(DatabaseClient)


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(payload: RegisterRequest, service: AuthService = Depends(get_auth_service)):
    return await service.register(payload)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, service: AuthService = Depends(get_auth_service)):
    return await service.login(payload)


@router.get("/me")
async def get_me(user: dict = Depends(require_user)):
    """Return the currently authenticated user from the JWT token."""
    return user
